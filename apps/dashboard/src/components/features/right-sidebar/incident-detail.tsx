"use client";

import type { Incident, Responder, Telemetry, Vehicle } from "@roam/shared";
import { cn } from "@roam/ui";
import { useEffect, useRef } from "react";
import { Button } from "../../ui/button";
import { Icon } from "../../ui/icon";
import {
	SidebarContent,
	SidebarHeader,
} from "../../ui/sidebar-primitives";
import { IncidentAssignedBody } from "./incident-assigned-body";
import { IncidentChainLog } from "./incident-chain-log";
import { IncidentPendingBody } from "./incident-pending-body";

type IncidentDetailProps = {
	incident: Incident | null;
	vehicles: Vehicle[];
	positions: Map<string, Telemetry>;
	responderMap: Map<string, Responder>;
	open: boolean;
	onClose: () => void;
	onDispatch?: (incident: Incident) => void;
};

// Slide-in detail panel. Picks between two bodies based on whether the
// incident already has units committed (`responding` / `resolved` → assigned
// view) or not (`live` / `pending` / `cancelled` → pending view).
//
// We keep a ref to the last-shown incident so the body content stays visible
// during the slide-out animation after the user clears the selection. The
// `open` flag is also forwarded to the transcript card so its typing
// animation can restart on each open.
export function IncidentDetail({
	incident,
	vehicles,
	positions,
	responderMap,
	open,
	onClose,
	onDispatch,
}: IncidentDetailProps) {
	const lastIncidentRef = useRef<Incident | null>(null);
	useEffect(() => {
		if (incident) lastIncidentRef.current = incident;
	}, [incident]);

	const display = incident ?? lastIncidentRef.current;
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
					size="sm"
					onClick={onClose}
					className="-ml-1 px-2 tracking-widest"
				>
					<Icon name="chevron_left" />
					Incidents
				</Button>
				<span className="font-mono text-2xs tabular-nums text-muted-foreground">
					{display?._id ?? ""}
				</span>
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
						positions={positions}
						panelOpen={open}
						onDispatch={onDispatch}
					/>
				)}
				{display && (
					<IncidentChainLog
						incidentId={display._id}
						vehicles={vehicles}
						responderMap={responderMap}
					/>
				)}
			</SidebarContent>
		</aside>
	);
}
