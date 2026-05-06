import { z } from "zod";

// `process.env.NEXT_PUBLIC_*` is statically inlined by Next at build time, so
// we read each var by its literal name (any computed access defeats the
// inlining). Validation runs once at module load — a bad env crashes the
// dashboard immediately rather than producing 404s deep in fetches.
const EnvSchema = z.object({
	NEXT_PUBLIC_BACKEND_URL: z
		.string()
		.url()
		.default("http://localhost:3001"),
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
