"use client";

import { useTelemetrySocket } from "@roam/api";
import { useCallback, useState } from "react";
import {
	isLive,
	TELEMETRY_LIVE_MS,
} from "@/components/features/left-sidebar/fleet-status.utils";
import { LeftSidebar } from "@/components/features/left-sidebar/left-sidebar";
import { LiveMap } from "@/components/features/map/live-map";
import { RightSidebar } from "@/components/features/right-sidebar/right-sidebar";
import { TopBar } from "@/components/features/top-bar";
import { MobileWarning } from "@/components/ui/mobile-warning";
import { SIDEBAR_CSS_VARS } from "@/components/ui/sidebar-primitives";
import { useFleetData } from "@/hooks/use-fleet-data";
import { useIncidentsData } from "@/hooks/use-incidents-data";
import { useNow } from "@/hooks/use-now";
import { getWsUrl } from "@/lib/config";

let alertTone: HTMLAudioElement | null = null;

function playAlertTone(): void {
	alertTone ??= new Audio("/911call.wav");
	alertTone.currentTime = 0;
	alertTone.play().catch((err: unknown) => {
		console.warn("[alert-tone] blocked:", err);
	});
}

function Page() {
	const {
		vehicles,
		responders,
		responderMap,
		connected: rosterConnected,
	} = useFleetData();
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
	const now = useNow();

	const transmittingCount = vehicles.filter((vehicle) => {
		const telemetry = positions.get(vehicle._id) ?? vehicle.lastTelemetry;
		return (
			telemetry !== undefined &&
			isLive(telemetry.timestamp, now, TELEMETRY_LIVE_MS)
		);
	}).length;

	const toggleLeft = useCallback(() => setLeftOpen((open) => !open), []);
	const toggleRight = useCallback(() => setRightOpen((open) => !open), []);

	const selectVehicleFromMap = useCallback((id: string) => {
		setSelectedVehicleId(id);
		setLeftOpen(true);
	}, []);
	const selectIncident = useCallback(
		(id: string) => {
			setSelectedIncidentId(id);
			setRightOpen(true);
			if (
				incidents.some(
					(i) =>
						i._id === id && (i.status === "live" || i.status === "pending"),
				)
			) {
				playAlertTone();
			}
		},
		[incidents],
	);
	const closeIncident = useCallback(() => setSelectedIncidentId(null), []);

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
					transmittingCount={transmittingCount}
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
							onSelectIncident={selectIncident}
						/>
					</main>

					<LeftSidebar
						open={leftOpen}
						vehicles={vehicles}
						responders={responders}
						positions={positions}
						responderMap={responderMap}
						now={now}
						transmittingCount={transmittingCount}
						telemetryConnected={telemetryConnected}
						rosterConnected={rosterConnected}
						selectedVehicleId={selectedVehicleId}
						onSelectVehicle={setSelectedVehicleId}
					/>

					<RightSidebar
						open={rightOpen}
						vehicles={vehicles}
						responderMap={responderMap}
						incidents={incidents}
						loading={incidentsLoading}
						connected={incidentsConnected}
						now={now}
						selectedIncidentId={selectedIncidentId}
						onSelectIncident={selectIncident}
						onCloseIncident={closeIncident}
					/>
				</div>
			</div>
		</MobileWarning>
	);
}

export { Page as default };
