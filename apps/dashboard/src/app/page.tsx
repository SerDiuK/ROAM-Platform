"use client";

import { useTelemetrySocket } from "@roam/api";
import { useCallback, useEffect, useState } from "react";
import { LeftSidebar } from "@/components/features/left-sidebar/left-sidebar";
import { LiveMap } from "@/components/features/map/live-map";
import { RightSidebar } from "@/components/features/right-sidebar/right-sidebar";
import { TopBar } from "@/components/features/top-bar";
import { MobileWarning } from "@/components/ui/mobile-warning";
import { SIDEBAR_CSS_VARS } from "@/components/ui/sidebar-primitives";
import { useFleetData } from "@/hooks/use-fleet-data";
import { useIncidentsData } from "@/hooks/use-incidents-data";
import { getWsUrl } from "@/lib/config";

function Page() {
	const { vehicles, responderMap } = useFleetData();
	const {
		data: incidents,
		loading: incidentsLoading,
		connected: incidentsConnected,
	} = useIncidentsData();

	const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(
		null,
	);
	const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(
		null,
	);
	const [leftOpen, setLeftOpen] = useState(true);
	const [rightOpen, setRightOpen] = useState(true);

	const wsUrl = getWsUrl();
	const { positions, connected: telemetryConnected } =
		useTelemetrySocket(wsUrl);

	useEffect(() => {
		if (
			selectedVehicleId &&
			!vehicles.some((v) => v._id === selectedVehicleId)
		) {
			setSelectedVehicleId(null);
		}
	}, [vehicles, selectedVehicleId]);

	useEffect(() => {
		if (
			selectedIncidentId &&
			!incidents.some((i) => i._id === selectedIncidentId)
		) {
			setSelectedIncidentId(null);
		}
	}, [incidents, selectedIncidentId]);

	const toggleLeft = useCallback(() => setLeftOpen((open) => !open), []);
	const toggleRight = useCallback(() => setRightOpen((open) => !open), []);

	// Map clicks select + force-open the relevant sidebar so the detail panel
	// is visible. Sidebar-internal selection (FleetStatus row click etc.) goes
	// through `setSelectedVehicleId` directly without touching open state.
	const selectVehicleFromMap = useCallback((id: string) => {
		setSelectedVehicleId(id);
		setLeftOpen(true);
	}, []);
	const selectIncidentFromMap = useCallback((id: string) => {
		setSelectedIncidentId(id);
		setRightOpen(true);
	}, []);

	return (
		<MobileWarning>
			<div
				className="flex h-svh w-full flex-col bg-background text-foreground"
				style={SIDEBAR_CSS_VARS}
			>
				<TopBar
					leftOpen={leftOpen}
					rightOpen={rightOpen}
					onToggleLeft={toggleLeft}
					onToggleRight={toggleRight}
					telemetryConnected={telemetryConnected}
					transmittingCount={positions.size}
					totalCount={vehicles.length}
				/>

				<div className="relative flex-1 overflow-hidden">
					<main className="absolute inset-0">
						<LiveMap
							vehicles={vehicles}
							positions={positions}
							incidents={incidents}
							rightSidebarOpen={rightOpen}
							onSelectVehicle={selectVehicleFromMap}
							onSelectIncident={selectIncidentFromMap}
						/>
					</main>

					<LeftSidebar
						open={leftOpen}
						onOpenChange={setLeftOpen}
						vehicles={vehicles}
						positions={positions}
						responderMap={responderMap}
						telemetryConnected={telemetryConnected}
						selectedVehicleId={selectedVehicleId}
						onSelectVehicle={setSelectedVehicleId}
					/>

					<RightSidebar
						open={rightOpen}
						onOpenChange={setRightOpen}
						vehicles={vehicles}
						positions={positions}
						responderMap={responderMap}
						incidents={incidents}
						loading={incidentsLoading}
						connected={incidentsConnected}
						selectedIncidentId={selectedIncidentId}
						onSelectIncident={setSelectedIncidentId}
					/>
				</div>
			</div>
		</MobileWarning>
	);
}

export { Page as default };
