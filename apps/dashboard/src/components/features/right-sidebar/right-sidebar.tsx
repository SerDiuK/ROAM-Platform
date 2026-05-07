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
import { useCallback, useState } from "react";
import { api } from "@/lib/api";

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
	const [dispatchingId, setDispatchingId] = useState<string | null>(null);

	// Pull the briefing for the selected incident, then confirm it. The
	// dispatcher's responderId is best-effort — if the seed includes a
	// dispatcher we record them as `decidedBy`, otherwise the call still
	// goes through as a `human` decision with no recorded operator (the
	// schema makes decidedBy optional).
	const handleDispatch = useCallback(
		async (incident: Incident) => {
			if (dispatchingId) return;
			setDispatchingId(incident._id);
			try {
				const result = await api.incidents.get({ id: incident._id });
				if (!result.briefing) {
					console.error("[dispatch] no briefing yet for", incident._id);
					return;
				}
				const dispatcher = Array.from(responderMap.values()).find(
					(r) => r.role === "dispatcher",
				);
				await api.dispatch.confirm({
					briefingId: result.briefing._id,
					decisionMaker: "human",
					decidedBy: dispatcher?._id,
					requiredAccepts: 1,
					expiresInSecs: 1800,
				});
			} catch (err) {
				console.error("[dispatch] confirm failed", err);
			} finally {
				setDispatchingId(null);
			}
		},
		[responderMap, dispatchingId],
	);

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
						onDispatch={handleDispatch}
					/>
				</div>
			</Sidebar>
		</SidebarProvider>
	);
}
