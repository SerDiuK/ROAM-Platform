"use client";

import { createApiClient } from "@roam/api";
import type { Incident, Responder, Vehicle } from "@roam/shared";
import { getBackendUrl } from "@/lib/config";

export const api = createApiClient(getBackendUrl());

export async function getVehicles(): Promise<Vehicle[]> {
	return api.vehicles.list();
}

export async function getResponders(): Promise<Responder[]> {
	return api.responders.list();
}

export async function getIncidents(): Promise<Incident[]> {
	return api.incidents.list();
}
