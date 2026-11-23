import type { Vehicle } from "@roam/shared";
import { atom } from "jotai";
import { api } from "@/lib/api";

export const vehiclesAtom = atom<Vehicle[]>([]);
export const vehiclesFailedAtom = atom(false);

export const fetchVehiclesAtom = atom(
	null,
	async (_get, set): Promise<void> => {
		try {
			set(vehiclesAtom, await api.vehicles.list());
			set(vehiclesFailedAtom, false);
		} catch {
			set(vehiclesFailedAtom, true);
		}
	},
);
