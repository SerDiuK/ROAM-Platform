import pino from "pino";
import type { FleetVehicle } from "./fleet.js";

const logger = pino({ name: "seed" });

interface VehicleListItem {
	_id: string;
	callsign: string;
	currentResponderId?: string | null;
}

// AD-22: sessions are gone — "stale" means a vehicle is currently in_use with
// a responder pinned via Responder.currentVehicleId. Checkout takes vehicleId
// directly now.
export async function endStaleFleetSessions(
	backendUrl: string,
	callsignToVehicleId: Map<string, string>,
): Promise<void> {
	const fleetVehicleIds = new Set(callsignToVehicleId.values());

	const res = await fetch(`${backendUrl}/api/vehicles`);
	if (!res.ok) {
		logger.warn(`Failed to list vehicles: ${res.status} ${await res.text()}`);
		return;
	}

	const vehicles = (await res.json()) as VehicleListItem[];
	const stale = vehicles.filter(
		(v) => fleetVehicleIds.has(v._id) && v.currentResponderId,
	);
	if (stale.length === 0) return;

	let ended = 0;
	for (const vehicle of stale) {
		const checkoutRes = await fetch(`${backendUrl}/api/auth/checkout`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ vehicleId: vehicle._id }),
		});
		if (checkoutRes.ok) {
			ended += 1;
		} else {
			logger.warn(
				`Failed to end stale checkout for ${vehicle.callsign} (${vehicle._id}): ${checkoutRes.status} ${await checkoutRes.text()}`,
			);
		}
	}
	logger.info(`Ended ${ended} stale fleet checkins`);
}

/**
 * Resolves callsign → backend-assigned vehicleId for the configured fleet.
 * Vehicles + responders are seeded by `pnpm --filter @roam/backend fleet:seed`;
 * if a fleet entry isn't present here, the seed step was skipped.
 */
export async function lookupFleet(
	backendUrl: string,
	fleet: FleetVehicle[],
): Promise<Map<string, string>> {
	const res = await fetch(`${backendUrl}/api/vehicles`);
	if (!res.ok) {
		throw new Error(
			`Failed to list vehicles: ${res.status} ${await res.text()}`,
		);
	}
	const vehicles = (await res.json()) as VehicleListItem[];
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
