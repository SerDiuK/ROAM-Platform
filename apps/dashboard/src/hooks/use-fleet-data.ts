"use client";

import type { Responder, Vehicle } from "@roam/shared";
import { useMemo } from "react";
import { getResponders, getVehicles } from "@/lib/api";
import { usePollingResource } from "./use-polling-resource";

const FLEET_POLL_MS = 10_000;

const EMPTY: { vehicles: Vehicle[]; responders: Responder[] } = {
	vehicles: [],
	responders: [],
};

async function loadFleet(): Promise<{
	vehicles: Vehicle[];
	responders: Responder[];
}> {
	const [vehicles, responders] = await Promise.all([
		getVehicles(),
		getResponders(),
	]);
	return { vehicles, responders };
}

type FleetData = {
	vehicles: Vehicle[];
	responders: Responder[];
	responderMap: Map<string, Responder>;
	connected: boolean;
};

export function useFleetData(): FleetData {
	const { data, connected } = usePollingResource(
		loadFleet,
		EMPTY,
		FLEET_POLL_MS,
	);
	const responderMap = useMemo(
		() => new Map(data.responders.map((r) => [r._id, r])),
		[data.responders],
	);
	return {
		vehicles: data.vehicles,
		responders: data.responders,
		responderMap,
		connected,
	};
}
