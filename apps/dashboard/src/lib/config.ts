import { z } from "zod";

// Read NEXT_PUBLIC_* vars by literal name: Next inlines only literal access at build time.
const EnvSchema = z.object({
	NEXT_PUBLIC_BACKEND_URL: z.string().url().default("http://localhost:3001"),
	NEXT_PUBLIC_WS_URL: z
		.string()
		.regex(/^wss?:\/\//, "must be a ws:// or wss:// URL")
		.default("ws://localhost:3001"),
});

const env = EnvSchema.parse({
	NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL,
	NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL,
});

export function getBackendUrl(): string {
	return env.NEXT_PUBLIC_BACKEND_URL;
}

export function getWsUrl(): string {
	return env.NEXT_PUBLIC_WS_URL;
}
