"use client";

import type { Briefing, Incident, Responder, Vehicle } from "@roam/shared";
import { cn } from "@roam/ui";
import { useState } from "react";
import { Button } from "../../ui/button";
import { Icon } from "../../ui/icon";
import { SidebarContent, SidebarHeader } from "../../ui/sidebar-primitives";
import { IncidentAssignedBody } from "./incident-assigned-body";
import { IncidentChainLog } from "./incident-chain-log";
import { IncidentPendingBody } from "./incident-pending-body";
import type { DispatchState } from "./recommendation-group";

type IncidentDetailProps = {
	incident: Incident | null;
	vehicles: Vehicle[];
	responderMap: Map<string, Responder>;
	now: number;
	dispatchState: DispatchState | undefined;
	open: boolean;
	onClose: () => void;
	onDispatch: (briefing: Briefing) => void;
};

export function IncidentDetail({
	incident,
	vehicles,
	responderMap,
	now,
	dispatchState,
	open,
	onClose,
	onDispatch,
}: IncidentDetailProps) {
	const [lastIncident, setLastIncident] = useState(incident);
	if (incident !== null && incident !== lastIncident) setLastIncident(incident);
	const display = incident ?? lastIncident;

	const isAssigned =
		display?.status === "responding" ||
		display?.status === "arrived" ||
		display?.status === "resolved";

	return (
		<aside
			data-slot="incident-detail"
			aria-hidden={!open}
			className={cn(
				"absolute inset-0 z-10 flex flex-col bg-sidebar transition-transform duration-200 ease-linear",
				open ? "translate-x-0" : "pointer-events-none translate-x-full",
			)}
		>
			<SidebarHeader className="justify-between">
				<Button
					variant="ghost"
					onClick={onClose}
					className="-ml-1 px-2 tracking-widest"
				>
					<Icon name="chevron_left" />
					Incidents
				</Button>
			</SidebarHeader>

			<SidebarContent className="gap-3 px-2 py-3">
				{display && isAssigned && (
					<IncidentAssignedBody
						incident={display}
						vehicles={vehicles}
						responderMap={responderMap}
					/>
				)}
				{display && !isAssigned && (
					<IncidentPendingBody
						incident={display}
						vehicles={vehicles}
						responderMap={responderMap}
						now={now}
						panelOpen={open}
						dispatchState={dispatchState}
						onDispatch={onDispatch}
					/>
				)}
				{open && display && (
					<IncidentChainLog
						key={display._id}
						incidentId={display._id}
						responderMap={responderMap}
					/>
				)}
			</SidebarContent>
		</aside>
	);
}
