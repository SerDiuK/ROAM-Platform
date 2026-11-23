import { readFileSync } from "node:fs";
import {
	DEMO_FLEET,
	DemoFleetSchema,
	type DemoFleetVehicle,
} from "@roam/shared";

export type FleetVehicle = DemoFleetVehicle;

const DEFAULT_FLEET: FleetVehicle[] = DEMO_FLEET;

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
