import { readFileSync } from "node:fs";
import {
	DEMO_FLEET,
	type DemoFleetVehicle,
	DemoFleetSchema,
} from "@roam/shared";

// Sim-fleet operates on the canonical demo fleet defined in @roam/shared so
// the backend's `fleet:seed` and this runtime always agree on callsigns,
// responders, and starting state.
export type FleetVehicle = DemoFleetVehicle;

export const DEFAULT_FLEET: FleetVehicle[] = DEMO_FLEET;

export function loadFleet(fleetConfigPath?: string): FleetVehicle[] {
	if (!fleetConfigPath) {
		return DEFAULT_FLEET;
	}

	const raw = readFileSync(fleetConfigPath, "utf-8");
	const parsed: unknown = JSON.parse(raw);
	const result = DemoFleetSchema.safeParse(parsed);
	if (!result.success) {
		throw new Error(
			`Invalid fleet config at ${fleetConfigPath}: ${result.error.message}`,
		);
	}
	return result.data;
}
