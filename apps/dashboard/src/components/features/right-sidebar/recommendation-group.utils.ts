import {
	type Coord,
	haversineKm,
	type Telemetry,
	type Vehicle,
} from "@roam/shared";

const AVG_RESPONSE_KMH = 50;

export function rankVehiclesByProximity(
	scene: Coord,
	vehicles: Vehicle[],
	positions: Map<string, Telemetry>,
): { vehicle: Vehicle; distanceKm: number }[] {
	const ranked: { vehicle: Vehicle; distanceKm: number }[] = [];
	for (const vehicle of vehicles) {
		const live = positions.get(vehicle._id);
		const snapshot = live ?? vehicle.lastTelemetry;
		if (!snapshot) continue;
		const distanceKm = haversineKm(scene, {
			lat: snapshot.lat,
			lon: snapshot.lon,
		});
		ranked.push({ vehicle, distanceKm });
	}
	ranked.sort((a, b) => a.distanceKm - b.distanceKm);
	return ranked;
}

export function formatEta(distanceKm: number): string {
	const totalSeconds = Math.max(
		30,
		Math.round((distanceKm / AVG_RESPONSE_KMH) * 3600),
	);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
