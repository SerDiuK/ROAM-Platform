import { type ApiClient, createApiClient } from "@roam/api";

// Always falls back to the dev backend port. Override with ROAM_BACKEND_URL
// in env when pointing the CLI at a remote stack.
export function backendUrl(): string {
	return process.env.ROAM_BACKEND_URL ?? "http://localhost:3001";
}

export function api(): ApiClient {
	return createApiClient(backendUrl());
}
