import { type ApiClient, createApiClient } from "@roam/api";
import { config } from "../config.js";

export function api(): ApiClient {
	return createApiClient(config.ROAM_BACKEND_URL);
}
