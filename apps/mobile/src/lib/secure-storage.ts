import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "roam.auth.token";
const NAME_KEY = "roam.auth.name";
const AUTH_TOKEN_KEY = "roam.mwa.authToken";

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

export async function readAuthToken(): Promise<string | null> {
	return SecureStore.getItemAsync(AUTH_TOKEN_KEY);
}

export async function writeAuthToken(authToken: string): Promise<void> {
	await SecureStore.setItemAsync(AUTH_TOKEN_KEY, authToken);
}

export async function clearAuthToken(): Promise<void> {
	await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
}
