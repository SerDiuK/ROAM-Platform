import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ path: ".env.local" });

export class ConfigError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ConfigError";
	}
}

const ConfigSchema = z.object({
	PORT: z.coerce.number().default(3001),
	MONGODB_URL: z.string().min(1),
	MQTT_PORT: z.coerce.number().default(1883),
	SOLANA_CLUSTER: z.string().default("devnet"),
	SOLANA_OPERATOR_KEYPAIR: z.string().optional(),
	DASHBOARD_ORIGINS: z
		.string()
		.default("http://localhost:3000")
		.transform((s) =>
			s
				.split(",")
				.map((o) => o.trim())
				.filter(Boolean)
				.map((o): string | RegExp => {
					if (!o.includes("*")) return o;
					const escaped = o
						.replace(/[.+?^${}()|[\]\\]/g, "\\$&")
						.replace(/\*/g, ".*");
					return new RegExp(`^${escaped}$`);
				}),
		),
	// Rotating this breaks the off-chain ↔ on-chain PDA mapping for all existing events.
	CHAIN_HMAC_KEY: z
		.string()
		.regex(/^[0-9a-fA-F]{64}$/, "must be 32 bytes hex (64 hex chars)"),
	// Only needed once push security is enabled on the Expo account.
	EXPO_ACCESS_TOKEN: z.string().optional(),
	AUTH_SECRET: z.string().min(32),
	// Keep at least twice mobile's token-renewal interval; a phone backgrounded
	// for longer than this returns to the login screen.
	AUTH_TOKEN_TTL_SECS: z.coerce.number().int().positive().default(60),
	X402_RECIPIENT_ADDRESS: z.string().min(32),
	// Must match SOLANA_CLUSTER.
	X402_NETWORK: z.enum(["solana-devnet", "solana"]).default("solana-devnet"),
	DEEPGRAM_API_KEY: z.string().min(1),
	ANTHROPIC_API_KEY: z.string().min(1),
	ANTHROPIC_MODEL: z.string().default("claude-sonnet-4-6"),
	// A briefing typically takes 3–5 turns.
	AGENT_MAX_TURNS: z.coerce.number().int().positive().default(8),
});

export type Config = z.infer<typeof ConfigSchema>;

export function parseConfig(): Config {
	const result = ConfigSchema.safeParse(process.env);
	if (!result.success) {
		const formatted = result.error.format();
		throw new ConfigError(
			`Invalid environment variables: ${JSON.stringify(formatted)}`,
		);
	}
	return result.data;
}
