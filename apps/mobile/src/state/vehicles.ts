import type { Telemetry, Vehicle } from "@roam/shared";
import { atom } from "jotai";
import { api } from "@/lib/api";

export const vehiclesAtom = atom<Vehicle[]>([]);
export const telemetryAtom = atom<Map<string, Telemetry>>(new Map());
export const connectedAtom = atom<boolean>(false);

export const fetchVehiclesAtom = atom(null, async (_get, set) => {
	try {
		const v = await api.vehicles.list();
		set(vehiclesAtom, v);
	} catch {
		// Soft-fail: keep the previous vehicle list.
	}
});
