import { createApiClient } from "@roam/api";
import { config } from "@/config";
import { readToken } from "@/lib/secure-storage";

let cachedToken: string | null = null;

export function setApiToken(token: string | null): void {
	cachedToken = token;
}

export async function loadApiTokenFromStorage(): Promise<string | null> {
	cachedToken = await readToken();
	return cachedToken;
}

export const api = createApiClient(config.BACKEND_URL, {
	getAuthToken: () => cachedToken,
});
