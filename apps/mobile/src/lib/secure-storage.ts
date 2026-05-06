import * as SecureStore from "expo-secure-store";

// Keys held in expo-secure-store. The token survives app reloads + device
// restarts; the name is cached separately so the login screen can default
// the field on subsequent launches (PIN-only re-sign-in).

const TOKEN_KEY = "roam.auth.token";
const NAME_KEY = "roam.auth.name";

export async function readToken(): Promise<string | null> {
	return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function writeToken(token: string): Promise<void> {
	await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
	await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function readCachedName(): Promise<string | null> {
	return SecureStore.getItemAsync(NAME_KEY);
}

export async function writeCachedName(name: string): Promise<void> {
	await SecureStore.setItemAsync(NAME_KEY, name);
}

export async function clearCachedName(): Promise<void> {
	await SecureStore.deleteItemAsync(NAME_KEY);
}
