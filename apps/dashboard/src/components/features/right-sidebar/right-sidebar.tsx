"use client";

import type { Briefing, Incident, Responder, Vehicle } from "@roam/shared";
import { useCallback, useState } from "react";
import { TabBar, tabButtonVariants } from "@/components/ui/tab-bar";
import { api } from "@/lib/api";
import {
	Sidebar,
	SidebarHeader,
	SidebarProvider,
} from "../../ui/sidebar-primitives";
import { IncidentDetail } from "./incident-detail";
import { IncidentsList } from "./incidents-list";
import type { DispatchState } from "./recommendation-group";

const DISPATCH_EXPIRES_SECS = 1_800;

function toDispatchFailure(err: unknown): DispatchState {
	if (err instanceof Error && err.message === "dispatch_already_active") {
		return { status: "conflict" };
	}
	return {
		status: "failed",
		message: err instanceof Error ? err.message : "Unknown error",
	};
}

type RightSidebarProps = {
	open: boolean;
	vehicles: Vehicle[];
	responderMap: Map<string, Responder>;
	incidents: Incident[];
	loading: boolean;
	connected: boolean;
	now: number;
	selectedIncidentId: string | null;
	onSelectIncident: (id: string) => void;
	onCloseIncident: () => void;
};

export function RightSidebar({
	open,
	vehicles,
	responderMap,
	incidents,
	loading,
	connected,
	now,
	selectedIncidentId,
	onSelectIncident,
	onCloseIncident,
}: RightSidebarProps) {
	const selectedIncident =
		incidents.find((i) => i._id === selectedIncidentId) ?? null;

	const [dispatchStates, setDispatchStates] = useState<
		Map<string, DispatchState>
	>(() => new Map());

	const handleDispatch = useCallback(
		(briefing: Briefing): void => {
			const { incidentId } = briefing;
			setDispatchStates((prev) =>
				new Map(prev).set(incidentId, { status: "sending" }),
			);
			const dispatcher = Array.from(responderMap.values()).find(
				(r) => r.role === "dispatcher",
			);
			api.dispatch
				.confirm({
					briefingId: briefing._id,
					decisionMaker: "human",
					decidedBy: dispatcher?._id,
					requiredAccepts: briefing.recommendedResponderIds.length,
					expiresInSecs: DISPATCH_EXPIRES_SECS,
				})
				.then(() => {
					setDispatchStates((prev) =>
						new Map(prev).set(incidentId, { status: "sent" }),
					);
				})
				.catch((err: unknown) => {
					setDispatchStates((prev) =>
						new Map(prev).set(incidentId, toDispatchFailure(err)),
					);
				});
		},
		[responderMap],
	);

	return (
		<SidebarProvider side="right" open={open}>
			<Sidebar side="right" collapsible="offcanvas">
				<div className="relative flex h-full w-full flex-col overflow-hidden">
					<SidebarHeader className="h-auto flex-col items-stretch gap-0 border-b-0 p-0">
						<TabBar>
							<h2 className={tabButtonVariants({ active: true })}>Incidents</h2>
						</TabBar>
					</SidebarHeader>

					<IncidentsList
						incidents={incidents}
						loading={loading}
						connected={connected}
						now={now}
						selectedIncidentId={selectedIncidentId}
						onSelectIncident={onSelectIncident}
					/>

					<IncidentDetail
						incident={selectedIncident}
						vehicles={vehicles}
						responderMap={responderMap}
						now={now}
						dispatchState={
							selectedIncident
								? dispatchStates.get(selectedIncident._id)
								: undefined
						}
						open={selectedIncident !== null}
						onClose={onCloseIncident}
						onDispatch={handleDispatch}
					/>
				</div>
			</Sidebar>
		</SidebarProvider>
	);
}
