import type { Telemetry, Vehicle } from "@roam/shared";
import { atom } from "jotai";
import { api } from "@/lib/api";

export const vehiclesAtom = atom<Vehicle[]>([]);
export const telemetryAtom = atom<Map<string, Telemetry>>(new Map());
export const connectedAtom = atom<boolean>(false);
export const selectedVehicleIdAtom = atom<string | null>(null);

export const selectedVehicleAtom = atom<Vehicle | null>((get) => {
	const id = get(selectedVehicleIdAtom);
	if (id === null) return null;
	return get(vehiclesAtom).find((v) => v._id === id) ?? null;
});

export const selectedTelemetryAtom = atom<Telemetry | undefined>((get) => {
	const id = get(selectedVehicleIdAtom);
	if (id === null) return undefined;
	return get(telemetryAtom).get(id);
});

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
