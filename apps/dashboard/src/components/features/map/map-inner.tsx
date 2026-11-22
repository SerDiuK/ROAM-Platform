"use client";

import type {
	Incident,
	IncidentUrgency,
	Telemetry,
	TelemetrySnapshot,
	Vehicle,
	VehicleStatus,
} from "@roam/shared";
import {
	cn,
	STATUS_HEX,
	STATUS_LABEL,
	URGENCY_HEX,
	URGENCY_LABEL,
} from "@roam/ui";
import { DivIcon } from "leaflet";
import { useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MapContainer, Marker, TileLayer } from "react-leaflet";
import { Icon } from "../../ui/icon";

type MapLayer = "street" | "satellite";

const ACTIVE_INCIDENT_STATUSES = new Set(["live", "pending", "responding"]);

function StatusMarker({ color }: { color: string }): React.ReactElement {
	return (
		<div className="flex size-8 cursor-pointer items-center justify-center">
			<div
				className="size-3.5 rounded-full border-2 border-background"
				style={{
					background: color,
					boxShadow: `0 0 0 1px ${color}80, 0 0 8px ${color}66`,
				}}
			/>
		</div>
	);
}

const STATUS_ICON_CACHE = new Map<VehicleStatus, DivIcon>();

function getStatusIcon(status: VehicleStatus): DivIcon {
	const cached = STATUS_ICON_CACHE.get(status);
	if (cached) return cached;
	const icon = new DivIcon({
		className: "",
		html: renderToStaticMarkup(<StatusMarker color={STATUS_HEX[status]} />),
		iconSize: [32, 32],
		iconAnchor: [16, 16],
	});
	STATUS_ICON_CACHE.set(status, icon);
	return icon;
}

function VehicleMarker({
	vehicle,
	telemetry,
	onSelect,
}: {
	vehicle: Vehicle;
	telemetry: Telemetry | TelemetrySnapshot;
	onSelect: (id: string) => void;
}): React.ReactElement {
	return (
		<Marker
			position={[telemetry.lat, telemetry.lon]}
			icon={getStatusIcon(vehicle.status)}
			eventHandlers={{
				click: () => onSelect(vehicle._id),
			}}
		/>
	);
}

function IncidentMarkerVisual({
	color,
	pulse,
}: {
	color: string;
	pulse: boolean;
}): React.ReactElement {
	return (
		<div className="relative flex size-12 cursor-pointer items-center justify-center">
			{pulse && (
				<span
					className="absolute inset-1 animate-ping rounded-full"
					style={{ background: `${color}55` }}
				/>
			)}
			<div
				className="relative flex size-6 items-center justify-center rounded-full border-2 border-background"
				style={{
					background: color,
					boxShadow: `0 0 0 2px ${color}80, 0 0 14px ${color}99`,
				}}
			>
				<span
					className="material-symbols-outlined leading-none text-background"
					style={{ fontSize: "14px" }}
				>
					emergency
				</span>
			</div>
		</div>
	);
}

const INCIDENT_ICON_CACHE = new Map<string, DivIcon>();

function getIncidentIcon(color: string, pulse: boolean): DivIcon {
	const key = `${color}|${pulse ? "1" : "0"}`;
	const cached = INCIDENT_ICON_CACHE.get(key);
	if (cached) return cached;
	const icon = new DivIcon({
		className: "",
		html: renderToStaticMarkup(
			<IncidentMarkerVisual color={color} pulse={pulse} />,
		),
		iconSize: [48, 48],
		iconAnchor: [24, 24],
	});
	INCIDENT_ICON_CACHE.set(key, icon);
	return icon;
}

function IncidentMarker({
	incident,
	onSelect,
}: {
	incident: Incident;
	onSelect: (id: string) => void;
}): React.ReactElement | null {
	const location = incident.classification?.location;
	if (!location) return null;
	const urgency: IncidentUrgency = incident.classification?.urgency ?? 2;
	const color = URGENCY_HEX[urgency];
	const pulse = incident.status === "live" || incident.status === "pending";
	return (
		<Marker
			position={[location.lat, location.lon]}
			icon={getIncidentIcon(color, pulse)}
			zIndexOffset={1000}
			eventHandlers={{
				click: () => onSelect(incident._id),
			}}
		/>
	);
}

export function MapInner({
	vehicles,
	positions,
	incidents,
	rightSidebarOpen,
	onSelectVehicle,
	onSelectIncident,
}: {
	vehicles: Vehicle[];
	positions: Map<string, Telemetry>;
	incidents: Incident[];
	rightSidebarOpen: boolean;
	onSelectVehicle: (id: string) => void;
	onSelectIncident: (id: string) => void;
}) {
	const [layer, setLayer] = useState<MapLayer>("street");

	const controlPositionStyle = {
		right: rightSidebarOpen ? "calc(var(--sidebar-width) + 0.5rem)" : "0.5rem",
	} satisfies React.CSSProperties;

	const activeIncidents = incidents.filter((i) =>
		ACTIVE_INCIDENT_STATUSES.has(i.status),
	);

	return (
		<div className="relative h-full w-full">
			<MapContainer center={[25.7617, -80.1918]} zoom={13} zoomControl={false}>
				{layer === "street" ? (
					<TileLayer
						attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
						url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
					/>
				) : (
					<TileLayer
						attribution="Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community"
						url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
					/>
				)}
				{vehicles.map((vehicle) => {
					const telemetry = positions.get(vehicle._id) ?? vehicle.lastTelemetry;
					if (!telemetry) return null;

					return (
						<VehicleMarker
							key={vehicle._id}
							vehicle={vehicle}
							telemetry={telemetry}
							onSelect={onSelectVehicle}
						/>
					);
				})}
				{activeIncidents.map((incident) => (
					<IncidentMarker
						key={incident._id}
						incident={incident}
						onSelect={onSelectIncident}
					/>
				))}
			</MapContainer>

			<div
				style={controlPositionStyle}
				className="absolute top-2 z-[1000] flex items-center gap-1 rounded-md border border-sidebar-border bg-background/90 p-1 shadow-md backdrop-blur transition-[right] duration-200 ease-linear"
			>
				<LayerButton
					active={layer === "street"}
					onClick={() => setLayer("street")}
					icon={<Icon name="map" />}
					label="Map"
				/>
				<LayerButton
					active={layer === "satellite"}
					onClick={() => setLayer("satellite")}
					icon={<Icon name="satellite_alt" />}
					label="Satellite"
				/>
			</div>

			<div
				style={controlPositionStyle}
				className="absolute bottom-5 z-[1000] flex flex-col gap-1 rounded-lg border border-sidebar-border bg-sidebar/90 px-3 py-2 shadow-md backdrop-blur transition-[right] duration-200 ease-linear"
			>
				<div className="pb-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground/80">
					Fleet
				</div>
				{(Object.keys(STATUS_HEX) as VehicleStatus[]).map((status) => (
					<div
						key={status}
						className="flex items-center gap-2 text-xs text-muted-foreground"
					>
						<span
							className="size-2.5 rounded-full border border-background"
							style={{ background: STATUS_HEX[status] }}
						/>
						<span>{STATUS_LABEL[status]}</span>
					</div>
				))}
				<div className="mt-1 border-sidebar-border border-t pt-1.5 pb-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground/80">
					Incidents
				</div>
				{([1, 2, 3] as IncidentUrgency[]).map((urgency) => (
					<div
						key={urgency}
						className="flex items-center gap-2 text-xs text-muted-foreground"
					>
						<span
							className="size-2.5 rounded-full border border-background"
							style={{ background: URGENCY_HEX[urgency] }}
						/>
						<span>{URGENCY_LABEL[urgency]}</span>
					</div>
				))}
			</div>
		</div>
	);
}

function LayerButton({
	active,
	onClick,
	icon,
	label,
}: {
	active: boolean;
	onClick: () => void;
	icon: React.ReactNode;
	label: string;
}): React.ReactElement {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={active}
			className={cn(
				"inline-flex h-7 items-center gap-2 rounded px-2 text-xs font-medium transition-colors",
				active
					? "bg-sidebar-accent text-sidebar-accent-foreground"
					: "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground",
			)}
		>
			{icon}
			{label}
		</button>
	);
}
