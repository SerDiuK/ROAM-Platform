"use client";

import type { Incident } from "@roam/shared";
import { getIncidents } from "@/lib/api";
import { type PollingResource, usePollingResource } from "./use-polling-resource";

const INCIDENTS_POLL_MS = 10_000;
const EMPTY: Incident[] = [];

export function useIncidentsData(): PollingResource<Incident[]> {
	return usePollingResource(getIncidents, EMPTY, INCIDENTS_POLL_MS);
}
