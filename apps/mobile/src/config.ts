import Constants from "expo-constants";
import { Platform } from "react-native";
import { z } from "zod";

export class ConfigError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ConfigError";
	}
}

// Metro serves the bundle from the host machine's LAN address — and passes it
// through as `hostUri` (modern SDK) or `debuggerHost` (legacy). Reusing it for
// the backend works on emulator, simulator, and physical devices on the same
// Wi-Fi without per-developer config. Production builds (no Metro link) hit
// the fallback, which is moot because they'll override via EXPO_PUBLIC_*.
function defaultHost(): string {
	const hostUri =
		Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
	if (hostUri) {
		return hostUri.split(":")[0];
	}
	return Platform.OS === "android" ? "10.0.2.2" : "localhost";
}

function defaultBackendUrl(): string {
	return `http://${defaultHost()}:3001`;
}

function defaultWsUrl(): string {
	return `ws://${defaultHost()}:3001`;
}

const ConfigSchema = z.object({
	BACKEND_URL: z.string().url(),
	WS_URL: z.string().url(),
	SOLANA_RPC_URL: z.string().url(),
});

export type Config = z.infer<typeof ConfigSchema>;

function parseConfig(): Config {
	const result = ConfigSchema.safeParse({
		BACKEND_URL: process.env.EXPO_PUBLIC_BACKEND_URL ?? defaultBackendUrl(),
		WS_URL: process.env.EXPO_PUBLIC_WS_URL ?? defaultWsUrl(),
		SOLANA_RPC_URL:
			process.env.EXPO_PUBLIC_SOLANA_RPC_URL ??
			"https://api.devnet.solana.com",
	});
	if (!result.success) {
		throw new ConfigError(
			`Invalid environment variables: ${JSON.stringify(result.error.format())}`,
		);
	}
	return result.data;
}

export const config = parseConfig();
