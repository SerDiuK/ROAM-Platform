"use client";

import type { Incident, Telemetry, Vehicle } from "@roam/shared";
import { Button } from "../../ui/button";
import { DataCell } from "../../ui/data-cell";
import { Icon } from "../../ui/icon";
import {
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
} from "../../ui/sidebar-primitives";
import { CapabilityChip, UrgencyTag } from "./incident-tags";
import { RecommendationGroup } from "./recommendation-group";
import { TranscriptCard } from "./transcript-card";
import { UrgencyBadge } from "./urgency-badge";

type IncidentPendingBodyProps = {
	incident: Incident;
	vehicles: Vehicle[];
	positions: Map<string, Telemetry>;
	panelOpen: boolean;
	onDispatch?: (incident: Incident) => void;
};

// Body for incidents that have NOT been dispatched yet (status=live, pending,
// cancelled). Shows the live transcript + classification + agent
// recommendation. The responding/resolved-with-units path lives in
// `incident-assigned-body.tsx`.
export function IncidentPendingBody({
	incident,
	vehicles,
	positions,
	panelOpen,
	onDispatch,
}: IncidentPendingBodyProps) {
	const showTranscript =
		incident.status === "live" || incident.status === "pending";
	const showActions =
		incident.status === "live" || incident.status === "pending";
	const classification = incident.classification;

	return (
		<>
			{showTranscript && (
				<TranscriptCard
					transcript={incident.transcript}
					callStartedAt={incident.callStartedAt}
					isLive={incident.status === "live"}
					panelOpen={panelOpen}
					resetKey={incident._id}
				/>
			)}

			{classification && (
				<SidebarGroup>
					<SidebarGroupLabel>Incident Type</SidebarGroupLabel>
					<SidebarGroupContent className="px-2">
						<div className="flex items-start justify-between gap-2">
							<div className="font-mono text-sm font-bold text-foreground">
								{classification.incidentType}
							</div>
							<UrgencyBadge urgency={classification.urgency} />
						</div>
						<div className="mt-1.5">
							<UrgencyTag urgency={classification.urgency} />
						</div>
						{classification.locationDescription && (
							<div className="mt-2 flex items-center gap-1.5 text-2xs text-muted-foreground">
								<Icon name="location_on" className="text-sm opacity-70" />
								{classification.locationDescription}
							</div>
						)}
					</SidebarGroupContent>
				</SidebarGroup>
			)}

			{classification && classification.requiredCapabilities.length > 0 && (
				<SidebarGroup>
					<SidebarGroupLabel>Capabilities required</SidebarGroupLabel>
					<SidebarGroupContent>
						<div className="flex flex-wrap gap-1.5 px-2">
							{classification.requiredCapabilities.map((cap) => (
								<CapabilityChip key={cap} label={cap} />
							))}
						</div>
					</SidebarGroupContent>
				</SidebarGroup>
			)}

			{showActions && (
				<>
					<RecommendationGroup
						scene={classification?.location}
						vehicles={vehicles}
						positions={positions}
					/>

					<div className="flex gap-2 px-2 pt-1">
						<Button variant="outline" size="sm" className="flex-1">
							Edit
						</Button>
						<Button
							variant="destructive"
							size="sm"
							className="flex-[2]"
							onClick={() => onDispatch?.(incident)}
						>
							Dispatch
						</Button>
					</div>
				</>
			)}

			{!showActions && (
				<SidebarGroup>
					<SidebarGroupLabel>Status</SidebarGroupLabel>
					<SidebarGroupContent>
						<div className="grid grid-cols-2 gap-2 px-2">
							<DataCell
								label="Status"
								value={<span className="capitalize">{incident.status}</span>}
							/>
							<DataCell
								label="Vehicles"
								value={incident.assigned.vehicles.length}
							/>
							<DataCell
								label="Responders"
								value={incident.assigned.responders.length}
							/>
						</div>
					</SidebarGroupContent>
				</SidebarGroup>
			)}
		</>
	);
}
