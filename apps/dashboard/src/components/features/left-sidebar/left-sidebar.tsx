"use client";

import type { Responder, Telemetry, Vehicle } from "@roam/shared";
import { useCallback, useState } from "react";
import {
	Sidebar,
	SidebarHeader,
	SidebarProvider,
} from "../../ui/sidebar-primitives";
import { TabBar, TabButton } from "../../ui/tab-bar";
import { FleetStatus } from "./fleet-status";
import { RespondersStatus } from "./responders-status";
import { VehicleDetail } from "./vehicle-detail";

type LeftTab = "fleet" | "responders";

type LeftSidebarProps = {
	open: boolean;
	vehicles: Vehicle[];
	responders: Responder[];
	positions: Map<string, Telemetry>;
	responderMap: Map<string, Responder>;
	now: number;
	transmittingCount: number;
	telemetryConnected: boolean;
	rosterConnected: boolean;
	selectedVehicleId: string | null;
	onSelectVehicle: (id: string | null) => void;
};

export function LeftSidebar({
	open,
	vehicles,
	responders,
	positions,
	responderMap,
	now,
	transmittingCount,
	telemetryConnected,
	rosterConnected,
	selectedVehicleId,
	onSelectVehicle,
}: LeftSidebarProps) {
	const [tab, setTab] = useState<LeftTab>("fleet");
	const showFleet = useCallback(() => setTab("fleet"), []);
	const showResponders = useCallback(() => setTab("responders"), []);
	const closeVehicle = useCallback(
		() => onSelectVehicle(null),
		[onSelectVehicle],
	);

	const selectedVehicle =
		vehicles.find((v) => v._id === selectedVehicleId) ?? null;

	return (
		<SidebarProvider side="left" open={open}>
			<Sidebar side="left" collapsible="offcanvas">
				<div className="relative flex h-full w-full flex-col overflow-hidden">
					<SidebarHeader className="h-auto flex-col items-stretch gap-0 border-b-0 p-0">
						<TabBar>
							<TabButton
								active={tab === "fleet"}
								onClick={showFleet}
								label="Fleet"
							/>
							<TabButton
								active={tab === "responders"}
								onClick={showResponders}
								label="Responders"
							/>
						</TabBar>
					</SidebarHeader>

					{tab === "fleet" ? (
						<FleetStatus
							vehicles={vehicles}
							positions={positions}
							responderMap={responderMap}
							now={now}
							transmittingCount={transmittingCount}
							telemetryConnected={telemetryConnected}
							selectedVehicleId={selectedVehicleId}
							onSelectVehicle={onSelectVehicle}
						/>
					) : (
						<RespondersStatus
							responders={responders}
							vehicles={vehicles}
							rosterConnected={rosterConnected}
						/>
					)}

					<VehicleDetail
						vehicle={selectedVehicle}
						positions={positions}
						responderMap={responderMap}
						now={now}
						open={selectedVehicle !== null}
						onClose={closeVehicle}
					/>
				</div>
			</Sidebar>
		</SidebarProvider>
	);
}
