import type { ApiClient } from "@roam/api";
import type { Vehicle } from "@roam/shared";
import pino from "pino";
import type { FleetVehicle } from "./fleet.js";

const logger = pino({ name: "seed" });

export async function endStaleFleetSessions(
	api: ApiClient,
	vehicles: Vehicle[],
	callsignToVehicleId: Map<string, string>,
): Promise<void> {
	const fleetVehicleIds = new Set(callsignToVehicleId.values());
	const stale = vehicles.filter(
		(v) => fleetVehicleIds.has(v._id) && v.currentResponderId,
	);
	if (stale.length === 0) return;

	let ended = 0;
	for (const vehicle of stale) {
		try {
			await api.auth.checkout({ vehicleId: vehicle._id });
			ended += 1;
		} catch (err: unknown) {
			logger.warn(
				{ err },
				`Failed to end stale checkout for ${vehicle.callsign} (${vehicle._id})`,
			);
		}
	}
	logger.info(`Ended ${ended} stale fleet checkins`);
}

export function lookupFleet(
	vehicles: Vehicle[],
	fleet: FleetVehicle[],
): Map<string, string> {
	const byCallsign = new Map(vehicles.map((v) => [v.callsign, v._id]));

	const callsignToVehicleId = new Map<string, string>();
	for (const vehicle of fleet) {
		const id = byCallsign.get(vehicle.callsign);
		if (!id) {
			logger.error(
				`Vehicle ${vehicle.callsign} missing from backend — run 'pnpm --filter @roam/backend fleet:seed'`,
			);
			continue;
		}
		callsignToVehicleId.set(vehicle.callsign, id);
	}
	return callsignToVehicleId;
}
