"use client";

import type { Responder, Telemetry, Vehicle } from "@roam/shared";
import { cn, formatRelative, STATUS_LABEL, STATUS_TONE } from "@roam/ui";
import { useEffect, useRef } from "react";
import { Button } from "../../ui/button";
import { DataCell } from "../../ui/data-cell";
import { Icon } from "../../ui/icon";
import {
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
} from "../../ui/sidebar-primitives";
import { StatusDot, StatusPill } from "../../ui/status-pill";

type VehicleDetailProps = {
	vehicle: Vehicle | null;
	positions: Map<string, Telemetry>;
	responderMap: Map<string, Responder>;
	open: boolean;
	onClose: () => void;
};

export function VehicleDetail({
	vehicle,
	positions,
	responderMap,
	open,
	onClose,
}: VehicleDetailProps) {
	const lastVehicleRef = useRef<Vehicle | null>(null);
	useEffect(() => {
		if (vehicle) lastVehicleRef.current = vehicle;
	}, [vehicle]);

	const display = vehicle ?? lastVehicleRef.current;

	const liveTelemetry = display ? positions.get(display._id) : undefined;
	const telemetry = liveTelemetry ?? display?.lastTelemetry;
	const isLive = liveTelemetry !== undefined;

	return (
		<aside
			data-slot="vehicle-detail"
			aria-hidden={!open}
			className={cn(
				"absolute inset-0 z-10 flex flex-col bg-sidebar transition-transform duration-200 ease-linear",
				open ? "translate-x-0" : "pointer-events-none translate-x-full",
			)}
		>
			<SidebarHeader className="justify-between">
				<Button
					variant="ghost"
					size="sm"
					onClick={onClose}
					className="-ml-1 px-2 tracking-widest"
				>
					<Icon name="chevron_left" />
					Fleet
				</Button>
			</SidebarHeader>

			<SidebarContent>
				{display && (
					<>
						<SidebarGroup>
							<SidebarGroupContent className="flex flex-col gap-3">
								{display.model.imageUrl && (
									<div className="aspect-video w-full overflow-hidden rounded-md border border-sidebar-border bg-sidebar-accent/30">
										{/* biome-ignore lint/performance/noImgElement: vehicle spec images come from arbitrary external hosts that can't be enumerated for next/image remotePatterns */}
										<img
											src={display.model.imageUrl}
											alt={`${display.model.manufacturer} ${display.model.name}`}
											className="h-full w-full object-cover"
										/>
									</div>
								)}
								<div className="flex flex-col gap-2">
									<div className="flex items-start justify-between gap-2">
										<div className="flex flex-col">
											<span className="text-xs uppercase tracking-wider text-muted-foreground">
												{display.model.manufacturer}
											</span>
											<span className="text-base font-semibold leading-tight text-foreground">
												{display.model.name}
											</span>
										</div>
										<StatusPill tone={STATUS_TONE[display.status]}>
											{STATUS_LABEL[display.status]}
										</StatusPill>
									</div>
								</div>
							</SidebarGroupContent>
						</SidebarGroup>

						<SidebarGroup>
							<SidebarGroupLabel className="flex items-center gap-2">
								<StatusDot
									tone={isLive ? "primary" : "muted"}
									size="xs"
									pulse={isLive}
								/>
								{isLive ? "Live" : "Last seen"}
							</SidebarGroupLabel>
							<SidebarGroupContent>
								{telemetry ? (
									<div className="grid grid-cols-2 gap-2 px-2">
										<DataCell
											label="Speed"
											value={`${telemetry.speed.toFixed(0)} km/h`}
										/>
										<DataCell
											label="Heading"
											value={`${Math.round(telemetry.heading)}°`}
										/>
										<DataCell label="Lat" value={telemetry.lat.toFixed(4)} />
										<DataCell label="Lon" value={telemetry.lon.toFixed(4)} />
										{telemetry.batteryPct !== undefined && (
											<DataCell
												label="Battery"
												value={`${telemetry.batteryPct.toFixed(0)}%`}
											/>
										)}
										<DataCell
											label="Updated"
											value={formatRelative(telemetry.timestamp)}
										/>
									</div>
								) : (
									<div className="px-2 py-2 text-xs text-muted-foreground">
										No telemetry yet
									</div>
								)}
							</SidebarGroupContent>
						</SidebarGroup>

						{display.currentResponderId && (
							<SidebarGroup>
								<SidebarGroupLabel>Responder</SidebarGroupLabel>
								<SidebarGroupContent>
									<div className="px-2 py-1 text-sm text-foreground">
										{responderMap.get(display.currentResponderId)
											?.displayName ??
											responderMap.get(display.currentResponderId)?.name ??
											display.currentResponderId}
									</div>
								</SidebarGroupContent>
							</SidebarGroup>
						)}
					</>
				)}
			</SidebarContent>
		</aside>
	);
}
