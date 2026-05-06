"use client";

import type { Incident } from "@roam/shared";
import { Icon } from "../../ui/icon";
import { SidebarContent, SidebarFooter } from "../../ui/sidebar-primitives";
import { StatusDot } from "../../ui/status-pill";
import { IncidentRow } from "./incident-row";

type IncidentsListProps = {
	incidents: Incident[];
	loading: boolean;
	connected: boolean;
	selectedIncidentId: string | null;
	onSelectIncident: (incident: Incident) => void;
};

export function IncidentsList({
	incidents,
	loading,
	connected,
	selectedIncidentId,
	onSelectIncident,
}: IncidentsListProps) {
	return (
		<>
			<SidebarContent className="px-2 py-2">
				{loading && incidents.length === 0 ? (
					<div className="flex flex-1 items-center justify-center px-4 text-center text-xs text-muted-foreground">
						Loading incidents…
					</div>
				) : incidents.length === 0 ? (
					<div className="flex flex-1 items-center justify-center px-4 text-center text-xs text-muted-foreground">
						<div>
							<Icon
								name="emergency"
								className="mx-auto mb-2 block text-xl opacity-40"
							/>
							No incidents
						</div>
					</div>
				) : (
					<ol className="flex flex-col gap-2">
						{incidents.map((incident) => (
							<IncidentRow
								key={incident._id}
								incident={incident}
								isActive={incident._id === selectedIncidentId}
								onSelect={() => onSelectIncident(incident)}
							/>
						))}
					</ol>
				)}
			</SidebarContent>

			<SidebarFooter>
				<div className="flex items-center justify-between text-xs">
					<span className="flex items-center gap-2 text-muted-foreground">
						<StatusDot
							tone={connected ? "primary" : "danger"}
							pulse={connected}
						/>
						{connected ? "Live" : "Disconnected"}
					</span>
					<span className="text-muted-foreground/60">
						{incidents.length} shown
					</span>
				</div>
			</SidebarFooter>
		</>
	);
}
