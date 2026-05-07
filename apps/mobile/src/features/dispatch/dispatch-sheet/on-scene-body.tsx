import type { Vehicle } from "@roam/shared";
import { useAtomValue } from "jotai";
import * as React from "react";
import { Image, View } from "react-native";
import { Button } from "@/components/ui/button";
import { SheetTitle } from "@/components/ui/sheet";
import { Text } from "@/components/ui/text";
import type { DispatchInboxData } from "../use-dispatch-inbox";
import { vehiclesAtom } from "@/state/vehicles";
import { ChainTimeline } from "./chain-timeline";
import { useIncidentEvents } from "./chain-timeline.hooks";
import { InfoRow } from "./info-row";
import { PriorityBadge } from "./priority-badge";

// Post-accept "we're on the call" panel. Shows the same incident header as
// IncomingBody (so the responder keeps context), the unit/location/crew strip,
// the on-chain Solana event timeline (live-polled from the backend), and the
// Clear-incident action that runs the same SIWS chain ceremony as accept/
// decline — flipping the dispatch to `cleared`.
export function OnSceneBody({
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
				<Button
					onPress={onDismiss}
					variant="ghost"
					size="icon"
					hitSlop={8}
					accessibilityLabel="Dismiss"
				>
					<Text className="text-lg leading-none text-muted-foreground">×</Text>
				</Button>
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
					valueClassName="text-primary"
				/>
				<InfoRow label="Location" value={locationText} />
				<InfoRow
					label="Crew"
					value={crewNames.length > 0 ? crewNames.join(" & ") : "—"}
				/>
			</View>

			<ChainTimeline events={events} responders={responders} />

			<Button
				onPress={onClear}
				disabled={clearing}
				size="xl"
				accessibilityLabel="Clear incident"
			>
				<Text>{clearing ? "Clearing…" : "Clear incident"}</Text>
			</Button>
		</View>
	);
}
