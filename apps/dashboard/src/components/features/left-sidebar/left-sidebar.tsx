"use client";

import type { Responder, Telemetry, Vehicle } from "@roam/shared";
import { useState } from "react";
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
	onOpenChange: (open: boolean) => void;
	vehicles: Vehicle[];
	responders: Responder[];
	positions: Map<string, Telemetry>;
	responderMap: Map<string, Responder>;
	telemetryConnected: boolean;
	rosterConnected: boolean;
	selectedVehicleId: string | null;
	onSelectVehicle: (id: string | null) => void;
};

export function LeftSidebar({
	open,
	onOpenChange,
	vehicles,
	responders,
	positions,
	responderMap,
	telemetryConnected,
	rosterConnected,
	selectedVehicleId,
	onSelectVehicle,
}: LeftSidebarProps) {
	const [tab, setTab] = useState<LeftTab>("fleet");

	const selectedVehicle =
		vehicles.find((v) => v._id === selectedVehicleId) ?? null;

	return (
		<SidebarProvider side="left" open={open} onOpenChange={onOpenChange}>
			<Sidebar side="left" collapsible="offcanvas">
				<div className="relative flex h-full w-full flex-col overflow-hidden">
					<SidebarHeader className="h-auto flex-col items-stretch gap-0 border-b-0 p-0">
						<TabBar>
							<TabButton
								active={tab === "fleet"}
								onClick={() => setTab("fleet")}
								label="Fleet"
							/>
							<TabButton
								active={tab === "responders"}
								onClick={() => setTab("responders")}
								label="Responders"
							/>
						</TabBar>
					</SidebarHeader>

					{tab === "fleet" ? (
						<FleetStatus
							vehicles={vehicles}
							positions={positions}
							responderMap={responderMap}
							telemetryConnected={telemetryConnected}
							selectedVehicleId={selectedVehicleId}
							onSelectVehicle={onSelectVehicle}
							showHeader={false}
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
						open={selectedVehicle !== null}
						onClose={() => onSelectVehicle(null)}
					/>
				</div>
			</Sidebar>
		</SidebarProvider>
	);
}
