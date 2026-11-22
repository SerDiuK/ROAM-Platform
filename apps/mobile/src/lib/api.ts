import { createApiClient } from "@roam/api";
import { type Contract, contract } from "@roam/shared";
import { config } from "@/config";
import { readToken } from "@/lib/secure-storage";

let cachedToken: string | null = null;

export function setApiToken(token: string | null): void {
	cachedToken = token;
}

export function getApiToken(): string | null {
	return cachedToken;
}

export async function loadApiTokenFromStorage(): Promise<string | null> {
	cachedToken = await readToken();
	return cachedToken;
}

export const api = createApiClient(config.BACKEND_URL, {
	getAuthToken: () => cachedToken,
});

export type { Contract };
export { contract };
