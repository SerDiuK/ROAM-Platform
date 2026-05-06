"use client";

import type { Incident, Responder, Telemetry, Vehicle } from "@roam/shared";
import { Icon } from "../../ui/icon";
import {
	Sidebar,
	SidebarHeader,
	SidebarProvider,
	SidebarTrigger,
} from "../../ui/sidebar-primitives";
import { IncidentDetail } from "./incident-detail";
import { IncidentsList } from "./incidents-list";

type RightSidebarProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	vehicles: Vehicle[];
	positions: Map<string, Telemetry>;
	responderMap: Map<string, Responder>;
	incidents: Incident[];
	loading: boolean;
	connected: boolean;
	selectedIncidentId: string | null;
	onSelectIncident: (id: string | null) => void;
};

export function RightSidebar({
	open,
	onOpenChange,
	vehicles,
	positions,
	responderMap,
	incidents,
	loading,
	connected,
	selectedIncidentId,
	onSelectIncident,
}: RightSidebarProps) {
	const selectedIncident =
		incidents.find((i) => i._id === selectedIncidentId) ?? null;

	return (
		<SidebarProvider side="right" open={open} onOpenChange={onOpenChange}>
			<Sidebar side="right" collapsible="offcanvas">
				<div className="relative flex h-full w-full flex-col overflow-hidden">
					<SidebarHeader>
						<SidebarTrigger className="-ml-1" />
						<div className="flex items-center gap-2">
							<Icon name="emergency" className="text-danger" />
							<span className="text-xs font-semibold uppercase tracking-widest text-foreground">
								Incidents
							</span>
						</div>
					</SidebarHeader>

					<IncidentsList
						incidents={incidents}
						loading={loading}
						connected={connected}
						selectedIncidentId={selectedIncidentId}
						onSelectIncident={(incident) => onSelectIncident(incident._id)}
					/>

					<IncidentDetail
						incident={selectedIncident}
						vehicles={vehicles}
						positions={positions}
						responderMap={responderMap}
						open={selectedIncident !== null}
						onClose={() => onSelectIncident(null)}
						onDispatch={(incident) =>
							console.log("[dispatch] todo wire AD-13", incident._id)
						}
					/>
				</div>
			</Sidebar>
		</SidebarProvider>
	);
}
