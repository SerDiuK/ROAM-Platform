"use client";

import type { Responder, ResponderAvailability, Vehicle } from "@roam/shared";
import { AVAILABILITY_LABEL, AVAILABILITY_TONE } from "@roam/ui";
import { useMemo } from "react";
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

type RespondersStatusProps = {
	responders: Responder[];
	vehicles: Vehicle[];
	rosterConnected: boolean;
};

const SORT_ORDER: ResponderAvailability[] = [
	"occupied",
	"available",
	"unavailable",
	"off_duty",
];

export function RespondersStatus({
	responders,
	vehicles,
	rosterConnected,
}: RespondersStatusProps) {
	const counts = useMemo<Record<ResponderAvailability, number>>(() => {
		const acc: Record<ResponderAvailability, number> = {
			available: 0,
			occupied: 0,
			off_duty: 0,
			unavailable: 0,
		};
		for (const r of responders) acc[r.availability] += 1;
		return acc;
	}, [responders]);

	const vehicleMap = useMemo(
		() => new Map(vehicles.map((v) => [v._id, v])),
		[vehicles],
	);

	const sorted = useMemo(
		() =>
			[...responders].sort((a, b) => {
				const ai = SORT_ORDER.indexOf(a.availability);
				const bi = SORT_ORDER.indexOf(b.availability);
				if (ai !== bi) return ai - bi;
				return (a.displayName ?? a.name).localeCompare(b.displayName ?? b.name);
			}),
		[responders],
	);

	const onDuty = counts.available + counts.occupied;

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
								label="Occupied"
								value={counts.occupied}
								leading={<StatusDot tone="warning" />}
								emphasis="metric"
							/>
							<DataCell
								label="Off duty"
								value={counts.off_duty + counts.unavailable}
								leading={<StatusDot tone="offline" />}
								emphasis="metric"
							/>
						</div>
					</SidebarGroupContent>
				</SidebarGroup>

				<SidebarGroup>
					<SidebarGroupLabel>
						Responders
						<span className="ml-auto text-2xs tabular-nums text-muted-foreground">
							{responders.length}
						</span>
					</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{sorted.length === 0 && (
								<li className="px-2 py-3 text-xs text-muted-foreground">
									No responders yet
								</li>
							)}
							{sorted.map((responder) => {
								const vehicle = responder.currentVehicleId
									? vehicleMap.get(responder.currentVehicleId)
									: undefined;
								const primaryLabel =
									responder.displayName ?? responder.name;
								const metaLabel = vehicle?.callsign ?? responder.name;
								return (
									<SidebarMenuItem key={responder._id}>
										<UnitCard
											tone={AVAILABILITY_TONE[responder.availability]}
											trailingTone="muted"
											callsign={primaryLabel}
											meta={metaLabel}
											trailingValue={AVAILABILITY_LABEL[responder.availability]}
										/>
									</SidebarMenuItem>
								);
							})}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>

			<SidebarFooter>
				<div className="flex items-center justify-between text-xs">
					<span className="flex items-center gap-2 text-muted-foreground">
						<StatusDot tone={rosterConnected ? "primary" : "danger"} />
						{rosterConnected ? "Roster live" : "Roster offline"}
					</span>
					<span className="tabular-nums text-muted-foreground">
						{onDuty}/{responders.length}
					</span>
				</div>
			</SidebarFooter>
		</>
	);
}
