import type { Telemetry, Vehicle } from "@roam/shared";
import { haversineKm } from "@roam/shared";
import { cn, formatDistance } from "@roam/ui";
import { useAtomValue } from "jotai";
import * as React from "react";
import { Image, Pressable, View } from "react-native";
import { SheetTitle } from "@/components/ui/sheet";
import { Text } from "@/components/ui/text";
import type { DispatchInboxData } from "../use-dispatch-inbox";
import { telemetryAtom, vehiclesAtom } from "@/state/vehicles";
import { InfoRow } from "./info-row";
import { PriorityBadge } from "./priority-badge";
import { ResponseTimer } from "./response-timer";

// First view a responder sees when a dispatch lands: incident header (priority
// + type + summary), unit/location/distance/crew strip, countdown, and the
// accept/decline pair. Distance is best-effort — recomputed from the live
// telemetry atom and falls back to the vehicle's last-known position when the
// stream hasn't ticked yet.
export function IncomingBody({
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
				<Pressable onPress={onDismiss} hitSlop={8} accessibilityLabel="Dismiss">
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
						className="h-24 w-1/3 rounded-md bg-sidebar-accent/30"
						resizeMode="contain"
					/>
				) : null}
			</View>

			<View className="gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/30 p-3">
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
					{submittingDecision === "accept" ? "Accepting…" : "Accept dispatch"}
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

function toCoord(
	snapshot: Vehicle["lastTelemetry"],
): Pick<Telemetry, "lat" | "lon"> | null {
	if (!snapshot) return null;
	return { lat: snapshot.lat, lon: snapshot.lon };
}
