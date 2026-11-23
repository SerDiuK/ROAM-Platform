"use client";

import type { Incident, Telemetry, Vehicle } from "@roam/shared";
import dynamic from "next/dynamic";

const MapInner = dynamic(
	() => import("./map-inner").then((mod) => mod.MapInner),
	{
		ssr: false,
		loading: () => (
			<div className="flex h-full w-full items-center justify-center bg-background text-sm text-muted-foreground">
				Loading map…
			</div>
		),
	},
);

type LiveMapProps = {
	vehicles: Vehicle[];
	positions: Map<string, Telemetry>;
	incidents: Incident[];
	rightSidebarOpen: boolean;
	onSelectVehicle: (id: string) => void;
	onSelectIncident: (id: string) => void;
};

export function LiveMap({
	vehicles,
	positions,
	incidents,
	rightSidebarOpen,
	onSelectVehicle,
	onSelectIncident,
}: LiveMapProps) {
	return (
		<MapInner
			vehicles={vehicles}
			positions={positions}
			incidents={incidents}
			rightSidebarOpen={rightSidebarOpen}
			onSelectVehicle={onSelectVehicle}
			onSelectIncident={onSelectIncident}
		/>
	);
}
