import { createApiClient } from "@roam/api";
import { type Contract, contract } from "@roam/shared";
import { config } from "@/config";
import { readToken } from "@/lib/secure-storage";

// In-memory token mirror so that calls made between secure-store reads stay
// fast — secure-store is async-only and we don't want every RPC to hit
// keychain. The mirror is seeded by the auth atom at boot and updated on
// signIn / signOut.
let cachedToken: string | null = null;

export function setApiToken(token: string | null): void {
	cachedToken = token;
}

export function getApiToken(): string | null {
	return cachedToken;
}

// Hydrates the in-memory token from secure-store on cold start. Call once
// before sending any authenticated RPC.
export async function loadApiTokenFromStorage(): Promise<string | null> {
	cachedToken = await readToken();
	return cachedToken;
}

export const api = createApiClient(config.BACKEND_URL, {
	getAuthToken: () => cachedToken,
});

export type { Contract };
export { contract };
