import type { IncidentEvent, IncidentEventKind } from "@roam/shared";
import { formatTime } from "@roam/ui";
import * as React from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { Sheet, SheetTitle } from "@/components/ui/sheet";
import { Text } from "@/components/ui/text";
import { api } from "@/lib/api";
import { solanaExplorerTxUrl } from "@/lib/solana-explorer";

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

const KIND_LABEL: Record<IncidentEventKind, string> = {
	received: "Call received",
	dispatched: "Dispatched to you",
	accepted: "You accepted",
	rejected: "You declined",
	arrived: "On scene",
	cleared: "Cleared",
};

export function MyEventsSheet({ open, onOpenChange }: Props): React.JSX.Element {
	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			{open ? <Body /> : null}
		</Sheet>
	);
}

function Body(): React.JSX.Element {
	const [events, setEvents] = React.useState<IncidentEvent[]>([]);
	const [loading, setLoading] = React.useState(true);
	const [error, setError] = React.useState<string | null>(null);

	React.useEffect(() => {
		let cancelled = false;
		const load = async (): Promise<void> => {
			try {
				const next = await api.events.listForResponder();
				if (!cancelled) setEvents(next);
			} catch (err: unknown) {
				if (!cancelled) {
					setError(err instanceof Error ? err.message : "Couldn't load events");
				}
			} finally {
				if (!cancelled) setLoading(false);
			}
		};
		void load();
		const interval = setInterval(() => void load(), 5000);
		return () => {
			cancelled = true;
			clearInterval(interval);
		};
	}, []);

	const grouped = React.useMemo(() => groupByIncident(events), [events]);

	return (
		<View className="gap-3 pb-2">
			<SheetTitle>My events</SheetTitle>

			{loading && events.length === 0 ? (
				<Text className="text-sm text-muted-foreground">Loading…</Text>
			) : error ? (
				<Text className="text-sm text-destructive">{error}</Text>
			) : grouped.length === 0 ? (
				<Text className="text-sm text-muted-foreground">
					No events yet — they'll appear here as dispatches come in.
				</Text>
			) : (
				<ScrollView className="max-h-[60vh]" showsVerticalScrollIndicator>
					<View className="gap-3">
						{grouped.map(({ incidentId, items }) => (
							<View
								key={incidentId}
								className="rounded-md border border-sidebar-border bg-sidebar-accent/30 p-3"
							>
								<Text className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
									Incident {incidentId.slice(0, 8)}
								</Text>
								<View className="gap-2">
									{items.map((event) => (
										<EventRow key={event._id} event={event} />
									))}
								</View>
							</View>
						))}
					</View>
				</ScrollView>
			)}
		</View>
	);
}

function EventRow({ event }: { event: IncidentEvent }): React.JSX.Element {
	const sig = event.solanaTxSignature;
	return (
		<View className="flex-row items-center justify-between gap-2">
			<View className="flex-1">
				<Text className="text-sm font-medium text-foreground">
					{KIND_LABEL[event.kind]}
				</Text>
				<Text className="text-2xs text-muted-foreground">
					{formatTime(event.occurredAt)}
				</Text>
			</View>
			{sig ? (
				<Pressable
					onPress={() => void Linking.openURL(solanaExplorerTxUrl(sig))}
					className="rounded border border-solana/40 bg-solana/10 px-2 py-1"
					accessibilityLabel="Open transaction in Solana explorer"
				>
					<Text className="text-2xs font-semibold uppercase tracking-wider text-solana">
						⬡ TX
					</Text>
				</Pressable>
			) : (
				<View className="rounded border border-sidebar-border bg-sidebar-accent/40 px-2 py-1">
					<Text className="text-2xs uppercase tracking-wider text-muted-foreground">
						⬡ pending
					</Text>
				</View>
			)}
		</View>
	);
}

function groupByIncident(
	events: IncidentEvent[],
): { incidentId: string; items: IncidentEvent[] }[] {
	const map = new Map<string, IncidentEvent[]>();
	for (const event of events) {
		const list = map.get(event.incidentId) ?? [];
		list.push(event);
		map.set(event.incidentId, list);
	}
	return [...map.entries()].map(([incidentId, items]) => ({
		incidentId,
		// Oldest first within an incident so the timeline reads top-down.
		items: items.sort(
			(a, b) =>
				new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
		),
	}));
}
