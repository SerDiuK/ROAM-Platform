import type { Coord, Telemetry, Vehicle } from "@roam/shared";
import { formatDistance } from "@roam/ui";
import {
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
} from "../../ui/sidebar-primitives";
import { UnitCard } from "../../ui/unit-card";
import {
	formatEta,
	rankVehiclesByProximity,
} from "./recommendation-group.utils";

type RecommendationGroupProps = {
	scene: Coord | undefined;
	vehicles: Vehicle[];
	positions: Map<string, Telemetry>;
};

export function RecommendationGroup({
	scene,
	vehicles,
	positions,
}: RecommendationGroupProps) {
	const candidates = scene
		? rankVehiclesByProximity(scene, vehicles, positions).slice(0, 2)
		: [];

	return (
		<SidebarGroup>
			<SidebarGroupLabel>ROAM Agent Recommendation</SidebarGroupLabel>
			<SidebarGroupContent>
				{!scene ? (
					<div className="px-2 py-2 text-2xs text-muted-foreground">
						Awaiting scene location…
					</div>
				) : candidates.length === 0 ? (
					<div className="px-2 py-2 text-2xs text-muted-foreground">
						No units transmitting position.
					</div>
				) : (
					<div className="flex flex-col gap-2 px-2">
						{candidates.map(({ vehicle, distanceKm }, index) => (
							<UnitCard
								key={vehicle._id}
								tone={index === 0 ? "danger" : "warning"}
								callsign={vehicle.callsign}
								meta={formatDistance(distanceKm)}
								trailingValue={formatEta(distanceKm)}
								trailingLabel="ETA"
							/>
						))}
					</div>
				)}
			</SidebarGroupContent>
		</SidebarGroup>
	);
}
