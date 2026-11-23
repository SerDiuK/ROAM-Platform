"use client";

import type { Briefing, Incident, Responder, Vehicle } from "@roam/shared";
import { DataCell } from "../../ui/data-cell";
import { Icon } from "../../ui/icon";
import {
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
} from "../../ui/sidebar-primitives";
import { CapabilityChip, UrgencyTag } from "./incident-tags";
import {
	type DispatchState,
	RecommendationGroup,
} from "./recommendation-group";
import { TranscriptCard } from "./transcript-card";
import { UrgencyBadge } from "./urgency-badge";

type IncidentPendingBodyProps = {
	incident: Incident;
	vehicles: Vehicle[];
	responderMap: Map<string, Responder>;
	now: number;
	panelOpen: boolean;
	dispatchState: DispatchState | undefined;
	onDispatch: (briefing: Briefing) => void;
};

export function IncidentPendingBody({
	incident,
	vehicles,
	responderMap,
	now,
	panelOpen,
	dispatchState,
	onDispatch,
}: IncidentPendingBodyProps) {
	const awaitingDispatch =
		incident.status === "live" || incident.status === "pending";
	const classification = incident.classification;

	return (
		<>
			{awaitingDispatch && (
				<TranscriptCard
					key={`transcript-${incident._id}`}
					transcript={incident.transcript}
					callStartedAt={incident.callStartedAt}
					isLive={incident.status === "live"}
					panelOpen={panelOpen}
					now={now}
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

			{awaitingDispatch && panelOpen && (
				<RecommendationGroup
					key={`recommendation-${incident._id}`}
					incidentId={incident._id}
					vehicles={vehicles}
					responderMap={responderMap}
					dispatchState={dispatchState}
					onDispatch={onDispatch}
				/>
			)}

			{!awaitingDispatch && (
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
