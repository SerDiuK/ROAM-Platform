import type { Telemetry, Vehicle } from "@roam/shared";
import { atom } from "jotai";
import { api } from "@/lib/api";

export const vehiclesAtom = atom<Vehicle[]>([]);
export const telemetryAtom = atom<Map<string, Telemetry>>(new Map());
export const connectedAtom = atom<boolean>(false);

// Write-only atom that fetches the vehicle list and updates the cache.
// Trigger via `useSetAtom(fetchVehiclesAtom)()`.
export const fetchVehiclesAtom = atom(null, async (_get, set) => {
	try {
		const v = await api.vehicles.list();
		set(vehiclesAtom, v);
	} catch {
		// soft-fail; RealtimeProvider retries on next session event tick
	}
});
