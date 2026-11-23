"use client";

import type {
	Responder,
	Telemetry,
	TelemetrySnapshot,
	Vehicle,
	VehicleStatus,
} from "@roam/shared";
import { STATUS_LABEL, STATUS_TONE } from "@roam/ui";
import { useCallback, useMemo } from "react";
import { DataCell } from "../../ui/data-cell";
import {
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuItem,
} from "../../ui/sidebar-primitives";
import { StatusDot } from "../../ui/status-pill";
import { UnitCard } from "../../ui/unit-card";
import { isLive, TELEMETRY_LIVE_MS } from "./fleet-status.utils";

type FleetStatusProps = {
	vehicles: Vehicle[];
	positions: Map<string, Telemetry>;
	responderMap: Map<string, Responder>;
	now: number;
	transmittingCount: number;
	telemetryConnected: boolean;
	selectedVehicleId: string | null;
	onSelectVehicle: (id: string) => void;
};

const SORT_ORDER: VehicleStatus[] = [
	"in_use",
	"available",
	"locked",
	"offline",
];

export function FleetStatus({
	vehicles,
	positions,
	responderMap,
	now,
	transmittingCount,
	telemetryConnected,
	selectedVehicleId,
	onSelectVehicle,
}: FleetStatusProps) {
	const counts = useMemo<Record<VehicleStatus, number>>(() => {
		const acc: Record<VehicleStatus, number> = {
			available: 0,
			in_use: 0,
			locked: 0,
			offline: 0,
		};
		for (const v of vehicles) acc[v.status] += 1;
		return acc;
	}, [vehicles]);

	const sorted = useMemo(
		() =>
			[...vehicles].sort((a, b) => {
				const ai = SORT_ORDER.indexOf(a.status);
				const bi = SORT_ORDER.indexOf(b.status);
				if (ai !== bi) return ai - bi;
				return a._id.localeCompare(b._id);
			}),
		[vehicles],
	);

	return (
		<>
			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupLabel>Roster</SidebarGroupLabel>
					<SidebarGroupContent>
						<div className="grid grid-cols-2 gap-2 px-2 pt-1">
							<DataCell
								label="Available"
								value={counts.available}
								leading={<StatusDot tone="primary" />}
								emphasis="metric"
							/>
							<DataCell
								label="Active"
								value={counts.in_use}
								leading={<StatusDot tone="warning" />}
								emphasis="metric"
							/>
							<DataCell
								label="Down"
								value={counts.locked + counts.offline}
								leading={<StatusDot tone="danger" />}
								emphasis="metric"
							/>
						</div>
					</SidebarGroupContent>
				</SidebarGroup>

				<SidebarGroup>
					<SidebarGroupLabel>
						Vehicles
						<span className="ml-auto text-2xs tabular-nums text-muted-foreground">
							{vehicles.length}
						</span>
					</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{sorted.length === 0 && (
								<li className="px-2 py-3 text-xs text-muted-foreground">
									No vehicles yet
								</li>
							)}
							{sorted.map((vehicle) => (
								<FleetRow
									key={vehicle._id}
									vehicle={vehicle}
									telemetry={
										positions.get(vehicle._id) ?? vehicle.lastTelemetry
									}
									responder={
										vehicle.currentResponderId
											? responderMap.get(vehicle.currentResponderId)
											: undefined
									}
									now={now}
									isActive={vehicle._id === selectedVehicleId}
									onSelect={onSelectVehicle}
								/>
							))}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>

			<SidebarFooter>
				<div className="flex items-center justify-between text-xs">
					<span className="flex items-center gap-2 text-muted-foreground">
						<StatusDot tone={telemetryConnected ? "primary" : "danger"} />
						{telemetryConnected ? "Telemetry live" : "Telemetry offline"}
					</span>
					<span className="tabular-nums text-muted-foreground">
						{transmittingCount}/{vehicles.length}
					</span>
				</div>
			</SidebarFooter>
		</>
	);
}

type FleetRowProps = {
	vehicle: Vehicle;
	telemetry: TelemetrySnapshot | undefined;
	responder: Responder | undefined;
	now: number;
	isActive: boolean;
	onSelect: (id: string) => void;
};

function FleetRow({
	vehicle,
	telemetry,
	responder,
	now,
	isActive,
	onSelect,
}: FleetRowProps) {
	const handleSelect = useCallback(
		() => onSelect(vehicle._id),
		[onSelect, vehicle._id],
	);

	return (
		<SidebarMenuItem>
			<UnitCard
				tone={STATUS_TONE[vehicle.status]}
				trailingTone="muted"
				callsign={responder?.displayName ?? responder?.name ?? vehicle.callsign}
				meta={responder ? vehicle.callsign : undefined}
				trailingValue={
					telemetry && isLive(telemetry.timestamp, now, TELEMETRY_LIVE_MS)
						? `${telemetry.speed.toFixed(0)} km/h`
						: STATUS_LABEL[vehicle.status]
				}
				isActive={isActive}
				onClick={handleSelect}
			/>
		</SidebarMenuItem>
	);
}
