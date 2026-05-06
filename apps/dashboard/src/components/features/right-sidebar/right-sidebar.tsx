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
import { TabBar, TabButton } from "@/components/ui/tab-bar";
import { useState } from "react";

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

    const [tab, setTab] = useState("fleet")

	return (
		<SidebarProvider side="right" open={open} onOpenChange={onOpenChange}>
			<Sidebar side="right" collapsible="offcanvas">
				<div className="relative flex h-full w-full flex-col overflow-hidden">
                    <SidebarHeader className="h-auto flex-col items-stretch gap-0 border-b-0 p-0">
                        <TabBar className="w-full">
							<TabButton
								active={tab === "fleet"}
								onClick={() => setTab("fleet")}
								label="Incidents"
							/>
						</TabBar>
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
