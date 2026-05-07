import type {
	IncidentEvent,
	IncidentEventKind,
	Responder,
	Telemetry,
	Vehicle,
} from "@roam/shared";
import { haversineKm } from "@roam/shared";
import { cn, formatDistance, formatTime, URGENCY_LABEL } from "@roam/ui";
import { useAtomValue } from "jotai";
import * as React from "react";
import { Image, Linking, Pressable, View } from "react-native";
import {
	cancelAnimation,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import { AnimatedProgress } from "@/components/ui/progress";
import { Sheet, SheetTitle } from "@/components/ui/sheet";
import { Text } from "@/components/ui/text";
import type {
	DispatchInboxData,
	DispatchInboxState,
} from "@/dispatch/use-dispatch-inbox";
import { api } from "@/lib/api";
import { telemetryAtom, vehiclesAtom } from "@/state/vehicles";

type Props = {
	state: DispatchInboxState;
	onAccept: () => void;
	onDecline: () => void;
	onClear: () => void;
	onDismiss: () => void;
};

const SOLANA_CLUSTER = "devnet";

const EVENT_KIND_LABEL: Record<IncidentEventKind, string> = {
	received: "RECEIVED",
	dispatched: "DISPATCHED",
	accepted: "ACCEPTED",
	rejected: "REJECTED",
	arrived: "ARRIVED",
	cleared: "CLEARED",
};

// Lime for forward-progress events, red for declines. Maps to the colour
// system already used elsewhere (status badges, accept button).
const EVENT_KIND_TONE: Record<
	IncidentEventKind,
	"lime" | "red" | "muted"
> = {
	received: "muted",
	dispatched: "muted",
	accepted: "lime",
	rejected: "red",
	arrived: "lime",
	cleared: "lime",
};

// Drawer that opens on incoming-dispatch push. Mirrors the vehicle-details
// sheet pattern (Sheet + Body) — stateless w.r.t. dispatch fetching, all data
// flows in via `state` from useDispatchInbox.
export function DispatchSheet({
	state,
	onAccept,
	onDecline,
	onClear,
	onDismiss,
}: Props): React.JSX.Element {
	const open = state.kind !== "idle";

	return (
		<Sheet
			open={open}
			onOpenChange={(next) => {
				if (!next) onDismiss();
			}}
		>
			<DispatchSheetBody
				state={state}
				onAccept={onAccept}
				onDecline={onDecline}
				onClear={onClear}
				onDismiss={onDismiss}
			/>
		</Sheet>
	);
}

function DispatchSheetBody({
	state,
	onAccept,
	onDecline,
	onClear,
	onDismiss,
}: Props): React.JSX.Element | null {
	if (state.kind === "idle") return null;

	if (state.kind === "loading") {
		return (
			<View className="gap-2 pb-2">
				<SheetTitle>Incoming dispatch</SheetTitle>
				<Text className="text-sm text-muted-foreground">
					Loading dispatch details…
				</Text>
			</View>
		);
	}

	if (state.kind === "error") {
		return (
			<View className="gap-2 pb-2">
				<SheetTitle>Couldn't load dispatch</SheetTitle>
				<Text className="text-sm text-destructive">{state.message}</Text>
				<Pressable
					onPress={onDismiss}
					className="mt-2 h-11 items-center justify-center rounded-md border border-border"
					accessibilityLabel="Dismiss"
				>
					<Text className="text-sm font-sans-semibold">Dismiss</Text>
				</Pressable>
			</View>
		);
	}

	const submitting = state.kind === "submitting";
	const decision = state.kind === "submitting" ? state.decision : null;

	if (state.kind === "claimed" || state.kind === "clearing") {
		return (
			<OnSceneBody
				data={state.data}
				clearing={state.kind === "clearing"}
				onClear={onClear}
				onDismiss={onDismiss}
			/>
		);
	}

	if (state.kind === "conflict") {
		return (
			<ConflictBody
				data={state.data}
				message={state.message}
				onDismiss={onDismiss}
			/>
		);
	}

	return (
		<IncomingBody
			data={state.data}
			submittingDecision={decision}
			disabled={submitting}
			onAccept={onAccept}
			onDecline={onDecline}
			onDismiss={onDismiss}
		/>
	);
}

function IncomingBody({
	data,
	submittingDecision,
	disabled,
	onAccept,
	onDecline,
	onDismiss,
}: {
	data: DispatchInboxData;
	submittingDecision: "accept" | "decline" | null;
	disabled: boolean;
	onAccept: () => void;
	onDecline: () => void;
	onDismiss: () => void;
}): React.JSX.Element {
	const { dispatch, incident, briefing, responders } = data;
	const vehicles = useAtomValue(vehiclesAtom);
	const telemetry = useAtomValue(telemetryAtom);

	const vehicle = React.useMemo(
		() =>
			dispatch.assignedVehicleIds
				.map((id) => vehicles.find((v) => v._id === id))
				.find((v): v is Vehicle => v !== undefined) ?? null,
		[dispatch.assignedVehicleIds, vehicles],
	);

	const distanceKm = React.useMemo(() => {
		const sceneCoord = incident.classification?.location;
		if (!sceneCoord || !vehicle) return null;
		const t = telemetry.get(vehicle._id) ?? toCoord(vehicle.lastTelemetry);
		if (!t) return null;
		return haversineKm({ lat: t.lat, lon: t.lon }, sceneCoord);
	}, [incident.classification?.location, vehicle, telemetry]);

	const crewNames = responders.map((r) => r.displayName ?? r.name);
	const urgency = incident.classification?.urgency;
	const incidentType = incident.classification?.incidentType ?? "Dispatch";
	const summary = briefing?.summary ?? "";
	const locationText = incident.classification?.locationDescription ?? "—";
	const incidentShortId = incident._id.slice(0, 8).toUpperCase();
	const imageUri = vehicle?.model.imageUrl;

	return (
		<View className="gap-3 pb-2">
			<View className="flex-row items-start justify-between">
				<SheetTitle className="tracking-widest">INCOMING DISPATCH</SheetTitle>
				<Pressable
					onPress={onDismiss}
					hitSlop={8}
					accessibilityLabel="Dismiss"
				>
					<Text className="text-lg leading-none text-muted-foreground">×</Text>
				</Pressable>
			</View>

			<View className="flex-row gap-3">
				<View className="flex-1 gap-1">
					<View className="flex-row items-center gap-2">
						{urgency ? <PriorityBadge urgency={urgency} /> : null}
						<Text className="font-mono text-2xs text-muted-foreground">
							INC-{incidentShortId}
						</Text>
					</View>
					<Text className="text-base font-sans-semibold text-foreground">
						{incidentType}
					</Text>
					{summary ? (
						<Text className="text-xs text-muted-foreground">{summary}</Text>
					) : null}
				</View>
				{imageUri ? (
					<Image
						source={{ uri: imageUri }}
						className="h-24 w-1/3 rounded-md bg-black/40"
						resizeMode="contain"
					/>
				) : null}
			</View>

			<View className="gap-2 rounded-md border border-border/60 bg-card/40 p-3">
				<InfoRow
					label="Unit"
					value={vehicle?.callsign ?? "—"}
					valueClassName="text-lime"
				/>
				<InfoRow label="Location" value={locationText} />
				<InfoRow
					label="Distance"
					value={distanceKm != null ? formatDistance(distanceKm) : "—"}
					valueClassName={distanceKm != null ? "text-lime" : undefined}
				/>
				<InfoRow
					label="Crew"
					value={crewNames.length > 0 ? crewNames.join(" & ") : "—"}
				/>
			</View>

			<ResponseTimer expiresAt={dispatch.expiresAt} onExpire={onDismiss} />

			<Pressable
				onPress={onAccept}
				disabled={disabled}
				className={cn(
					"h-14 items-center justify-center rounded-md bg-lime",
					disabled && "opacity-50",
				)}
				accessibilityLabel="Accept dispatch"
			>
				<Text className="text-base font-sans-bold uppercase tracking-wider text-lime-foreground">
					{submittingDecision === "accept"
						? "Accepting…"
						: "Accept dispatch"}
				</Text>
			</Pressable>

			<Pressable
				onPress={onDecline}
				disabled={disabled}
				className={cn(
					"h-10 items-center justify-center rounded-md border border-border",
					disabled && "opacity-50",
				)}
				accessibilityLabel="Decline dispatch"
			>
				<Text className="text-sm font-sans-medium text-muted-foreground">
					{submittingDecision === "decline" ? "Declining…" : "Decline"}
				</Text>
			</Pressable>
		</View>
	);
}

// Post-accept "we're on the call" panel. Shows the same incident header as
// IncomingBody (so the responder keeps context), the unit/location/crew strip,
// the on-chain Solana event timeline (live-polled from the backend), and the
// Clear-incident action that runs the same SIWS chain ceremony as accept/
// decline — flipping the dispatch to `cleared`.
function OnSceneBody({
	data,
	clearing,
	onClear,
	onDismiss,
}: {
	data: DispatchInboxData;
	clearing: boolean;
	onClear: () => void;
	onDismiss: () => void;
}): React.JSX.Element {
	const { dispatch, incident, briefing, responders } = data;
	const vehicles = useAtomValue(vehiclesAtom);
	const events = useIncidentEvents(incident._id);

	const vehicle = React.useMemo(
		() =>
			dispatch.assignedVehicleIds
				.map((id) => vehicles.find((v) => v._id === id))
				.find((v): v is Vehicle => v !== undefined) ?? null,
		[dispatch.assignedVehicleIds, vehicles],
	);

	const crewNames = responders.map((r) => r.displayName ?? r.name);
	const urgency = incident.classification?.urgency;
	const incidentType = incident.classification?.incidentType ?? "Dispatch";
	const summary = briefing?.summary ?? "";
	const locationText = incident.classification?.locationDescription ?? "—";
	const incidentShortId = incident._id.slice(0, 8).toUpperCase();
	const imageUri = vehicle?.model.imageUrl;

	return (
		<View className="gap-3 pb-2">
			<View className="flex-row items-start justify-between">
				<SheetTitle className="tracking-widest">ON SCENE</SheetTitle>
				<Pressable
					onPress={onDismiss}
					hitSlop={8}
					accessibilityLabel="Dismiss"
				>
					<Text className="text-lg leading-none text-muted-foreground">×</Text>
				</Pressable>
			</View>

			<View className="flex-row gap-3">
				<View className="flex-1 gap-1">
					<View className="flex-row items-center gap-2">
						{urgency ? <PriorityBadge urgency={urgency} /> : null}
						<Text className="font-mono text-2xs text-muted-foreground">
							INC-{incidentShortId}
						</Text>
					</View>
					<Text className="text-base font-sans-semibold text-foreground">
						{incidentType}
					</Text>
					{summary ? (
						<Text className="text-xs text-muted-foreground">{summary}</Text>
					) : null}
				</View>
				{imageUri ? (
					<Image
						source={{ uri: imageUri }}
						className="h-24 w-1/3 rounded-md bg-black/40"
						resizeMode="contain"
					/>
				) : null}
			</View>

			<View className="gap-2 rounded-md border border-border/60 bg-card/40 p-3">
				<InfoRow
					label="Unit"
					value={vehicle?.callsign ?? "—"}
					valueClassName="text-lime"
				/>
				<InfoRow label="Location" value={locationText} />
				<InfoRow
					label="Crew"
					value={crewNames.length > 0 ? crewNames.join(" & ") : "—"}
				/>
			</View>

			<ChainTimeline events={events} responders={responders} />

			<Pressable
				onPress={onClear}
				disabled={clearing}
				className={cn(
					"h-14 items-center justify-center rounded-md bg-lime",
					clearing && "opacity-50",
				)}
				accessibilityLabel="Clear incident"
			>
				<Text className="text-base font-sans-bold uppercase tracking-wider text-lime-foreground">
					{clearing ? "Clearing…" : "Clear incident"}
				</Text>
			</Pressable>
		</View>
	);
}

// Polls events for one incident every 3s while the panel is open. Best-effort
// — failures are swallowed so the panel still renders without timeline data.
// 3s is snappier than the MyEventsSheet's 5s because the responder is actively
// watching the chain confirmations land here.
function useIncidentEvents(incidentId: string): IncidentEvent[] {
	const [events, setEvents] = React.useState<IncidentEvent[]>([]);

	React.useEffect(() => {
		let cancelled = false;
		const load = async (): Promise<void> => {
			try {
				const next = await api.events.listByIncident({ incidentId });
				if (!cancelled) setEvents(next);
			} catch {
				// best-effort — the panel is still useful without the timeline
			}
		};
		void load();
		const interval = setInterval(() => void load(), 3000);
		return () => {
			cancelled = true;
			clearInterval(interval);
		};
	}, [incidentId]);

	return events;
}

function ChainTimeline({
	events,
	responders,
}: {
	events: IncidentEvent[];
	responders: Responder[];
}): React.JSX.Element {
	const sorted = React.useMemo(
		() =>
			[...events].sort(
				(a, b) =>
					new Date(b.occurredAt).getTime() -
					new Date(a.occurredAt).getTime(),
			),
		[events],
	);

	return (
		<View className="gap-2 rounded-md border border-border/60 bg-card/40 p-3">
			<Text className="text-2xs font-sans-bold uppercase tracking-wider text-solana">
				On-Chain · Solana
			</Text>
			{sorted.length === 0 ? (
				<Text className="text-2xs text-muted-foreground">
					No events yet — they'll land here as the chain confirms.
				</Text>
			) : (
				sorted.map((event, idx) => (
					<ChainTimelineRow
						key={event._id}
						event={event}
						responders={responders}
						isLast={idx === sorted.length - 1}
					/>
				))
			)}
		</View>
	);
}

function ChainTimelineRow({
	event,
	responders,
	isLast,
}: {
	event: IncidentEvent;
	responders: Responder[];
	isLast: boolean;
}): React.JSX.Element {
	const tone = EVENT_KIND_TONE[event.kind];
	const dotClass =
		tone === "lime"
			? "bg-lime"
			: tone === "red"
				? "bg-danger"
				: "bg-muted-foreground";
	const labelClass =
		tone === "lime"
			? "text-lime"
			: tone === "red"
				? "text-danger"
				: "text-muted-foreground";

	const responder =
		event.responderId != null
			? responders.find((r) => r._id === event.responderId)
			: undefined;
	const responderLabel = event.responderId
		? (responder?.displayName ?? responder?.name ?? "Responder")
		: "Incident";

	const sig = event.solanaTxSignature;

	return (
		<View className="flex-row gap-2">
			<View className="items-center pt-1">
				<View className={cn("h-1.5 w-1.5 rounded-full", dotClass)} />
				{!isLast ? (
					<View className="my-1 w-px flex-1 bg-border" />
				) : null}
			</View>
			<View className="flex-1 pb-2">
				<View className="flex-row items-baseline justify-between gap-2">
					<Text
						className={cn(
							"text-2xs font-sans-bold uppercase tracking-wider",
							labelClass,
						)}
					>
						{EVENT_KIND_LABEL[event.kind]}
					</Text>
					<Text className="font-mono text-2xs text-muted-foreground">
						{formatTime(event.occurredAt)}
					</Text>
				</View>
				<Text className="mt-0.5 text-2xs text-muted-foreground">
					{responderLabel}
				</Text>
				<View className="mt-1 flex-row items-center gap-2">
					{sig ? (
						<Pressable
							onPress={() =>
								void Linking.openURL(
									`https://explorer.solana.com/tx/${sig}?cluster=${SOLANA_CLUSTER}`,
								)
							}
							className="rounded border border-solana/40 bg-solana/10 px-2 py-0.5"
							accessibilityLabel="Open transaction in Solana explorer"
						>
							<Text className="font-mono text-2xs font-sans-semibold text-solana">
								{shortSig(sig)} ↗
							</Text>
						</Pressable>
					) : (
						<View className="rounded border border-border/40 bg-muted/30 px-2 py-0.5">
							<Text className="text-2xs uppercase tracking-wider text-muted-foreground">
								⬡ pending
							</Text>
						</View>
					)}
				</View>
			</View>
		</View>
	);
}

function shortSig(sig: string): string {
	if (sig.length <= 9) return sig;
	return `${sig.slice(0, 4)}…${sig.slice(-4)}`;
}

function ConflictBody({
	data,
	message,
	onDismiss,
}: {
	data: DispatchInboxData;
	message: string;
	onDismiss: () => void;
}): React.JSX.Element {
	const human =
		message === "dispatch_already_claimed"
			? "Another responder claimed this dispatch first."
			: message;
	return (
		<View className="gap-3 pb-2">
			<SheetTitle>Already claimed</SheetTitle>
			<Text className="text-sm text-muted-foreground">{human}</Text>
			<Text className="text-2xs text-muted-foreground">
				INC-{data.incident._id.slice(0, 8).toUpperCase()}
			</Text>
			<Pressable
				onPress={onDismiss}
				className="mt-2 h-12 items-center justify-center rounded-md bg-primary"
				accessibilityLabel="Close"
			>
				<Text className="text-sm font-sans-semibold text-primary-foreground">
					Got it
				</Text>
			</Pressable>
		</View>
	);
}

function PriorityBadge({ urgency }: { urgency: 1 | 2 | 3 }): React.JSX.Element {
	const tone =
		urgency === 1
			? "bg-danger/20 text-danger"
			: urgency === 2
				? "bg-warning/20 text-warning"
				: "bg-muted text-muted-foreground";
	return (
		<View className={cn("rounded-sm px-1.5 py-0.5", tone)}>
			<Text className={cn("text-2xs font-sans-bold uppercase tracking-wider")}>
				{URGENCY_LABEL[urgency]}
			</Text>
		</View>
	);
}

function InfoRow({
	label,
	value,
	valueClassName,
}: {
	label: string;
	value: string;
	valueClassName?: string;
}): React.JSX.Element {
	return (
		<View className="flex-row items-center justify-between">
			<Text className="text-2xs uppercase tracking-wider text-muted-foreground">
				{label}
			</Text>
			<Text
				className={cn(
					"font-mono text-xs font-sans-medium text-foreground",
					valueClassName,
				)}
			>
				{value}
			</Text>
		</View>
	);
}

// Counts down from now → expiresAt. The track fill animates the remaining
// fraction; the seconds label is a 1Hz `useState` tick (cheap, and only this
// component re-renders). Calls `onExpire` exactly once when the deadline passes
// so the parent can dismiss the sheet.
function ResponseTimer({
	expiresAt,
	onExpire,
}: {
	expiresAt: Date | string;
	onExpire: () => void;
}): React.JSX.Element {
	const expiresMs = React.useMemo(
		() =>
			typeof expiresAt === "string"
				? new Date(expiresAt).getTime()
				: expiresAt.getTime(),
		[expiresAt],
	);

	const totalMs = React.useMemo(
		() => Math.max(1000, expiresMs - Date.now()),
		[expiresMs],
	);

	const progress = useSharedValue(1);
	const expiredRef = React.useRef(false);
	const [remainingSecs, setRemainingSecs] = React.useState(() =>
		Math.max(0, Math.ceil((expiresMs - Date.now()) / 1000)),
	);

	React.useEffect(() => {
		expiredRef.current = false;
		progress.value = 1;
		const remainingMs = Math.max(0, expiresMs - Date.now());
		progress.value = withTiming(0, { duration: remainingMs });

		const tick = (): void => {
			const left = Math.max(0, Math.ceil((expiresMs - Date.now()) / 1000));
			setRemainingSecs(left);
			if (left <= 0 && !expiredRef.current) {
				expiredRef.current = true;
				onExpire();
			}
		};
		tick();
		const interval = setInterval(tick, 250);
		return () => {
			clearInterval(interval);
			cancelAnimation(progress);
		};
	}, [expiresMs, progress, onExpire]);

	const fillClass =
		remainingSecs > totalMs / 1000 / 2
			? "bg-lime"
			: remainingSecs > totalMs / 1000 / 4
				? "bg-warning"
				: "bg-danger";

	return (
		<View className="gap-1.5">
			<View className="flex-row items-center justify-between">
				<Text className="text-2xs uppercase tracking-wider text-muted-foreground">
					Respond within
				</Text>
				<Text className="font-mono text-xs font-sans-semibold text-foreground tabular-nums">
					{remainingSecs}s
				</Text>
			</View>
			<AnimatedProgress
				progress={progress}
				className="h-1.5 rounded-full bg-muted"
				indicatorClassName={fillClass}
			/>
		</View>
	);
}

function toCoord(snapshot: Vehicle["lastTelemetry"]):
	| Pick<Telemetry, "lat" | "lon">
	| null {
	if (!snapshot) return null;
	return { lat: snapshot.lat, lon: snapshot.lon };
}
