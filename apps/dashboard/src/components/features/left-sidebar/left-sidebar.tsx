"use client";

import type { Responder, Telemetry, Vehicle } from "@roam/shared";
import { useMemo, useState } from "react";
import { Icon } from "../../ui/icon";
import { ListRow } from "../../ui/list-row";
import {
	Sidebar,
	SidebarContent,
	SidebarHeader,
	SidebarProvider,
} from "../../ui/sidebar-primitives";
import { StatusDot } from "../../ui/status-pill";
import { TabBar, TabButton } from "../../ui/tab-bar";
import { FleetStatus } from "./fleet-status";
import { VehicleDetail } from "./vehicle-detail";

type LeftTab = "fleet" | "responders";

type LeftSidebarProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	vehicles: Vehicle[];
	positions: Map<string, Telemetry>;
	responderMap: Map<string, Responder>;
	telemetryConnected: boolean;
	selectedVehicleId: string | null;
	onSelectVehicle: (id: string | null) => void;
};

export function LeftSidebar({
	open,
	onOpenChange,
	vehicles,
	positions,
	responderMap,
	telemetryConnected,
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
								icon={<Icon name="local_shipping" />}
								label="Fleet"
							/>
							<TabButton
								active={tab === "responders"}
								onClick={() => setTab("responders")}
								icon={<Icon name="group" />}
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
						<RespondersList vehicles={vehicles} responderMap={responderMap} />
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

function RespondersList({
	vehicles,
	responderMap,
}: {
	vehicles: Vehicle[];
	responderMap: Map<string, Responder>;
}) {
	const active = useMemo(
		() =>
			vehicles
				.filter((v) => v.currentResponderId && v.status === "in_use")
				.map((v) => ({
					vehicle: v,
					responder: v.currentResponderId
						? (responderMap.get(v.currentResponderId) ?? null)
						: null,
				}))
				.sort((a, b) =>
					(a.responder?.displayName ?? a.responder?.name ?? "").localeCompare(
						b.responder?.displayName ?? b.responder?.name ?? "",
					),
				),
		[vehicles, responderMap],
	);

	if (active.length === 0) {
		return (
			<SidebarContent className="px-2 py-2">
				<div className="flex flex-1 items-center justify-center px-4 py-8 text-center text-xs text-muted-foreground">
					<div>
						<Icon
							name="group"
							className="mx-auto mb-2 block text-xl opacity-40"
						/>
						No responders on duty
					</div>
				</div>
			</SidebarContent>
		);
	}

	return (
		<SidebarContent className="px-2 py-2">
			<div className="px-2 pb-2 text-2xs font-semibold uppercase tracking-widest text-muted-foreground">
				On duty · {active.length}
			</div>
			<ol className="flex flex-col gap-2">
				{active.map(({ vehicle, responder }) => (
					<ListRow key={vehicle._id} className="items-center">
						<StatusDot tone="warning" pulse />
						<div className="min-w-0 flex-1">
							<div className="truncate text-xs font-medium text-foreground">
								{responder?.displayName ??
									responder?.name ??
									vehicle.currentResponderId}
							</div>
							<div className="truncate text-2xs text-muted-foreground">
								{vehicle.callsign}
							</div>
						</div>
					</ListRow>
				))}
			</ol>
		</SidebarContent>
	);
}
