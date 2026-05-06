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
	// Wallet provider. `embedded-solana` runs custodial wallets on whichever
	// cluster SOLANA_CLUSTER points at — only option that supports devnet today
	// (see ROAM-Tasks.md AD-2 for the Crossmint pivot rationale). `crossmint`
	// is kept as a future option for mainnet operator UX with passkey signers;
	// the implementation lives in src/wallet/crossmint.ts but is not wired in.
	WALLET_PROVIDER: z.enum(["embedded-solana"]).default("embedded-solana"),
	// 32-byte hex (64 chars) for AES-256-GCM encryption of operator keypairs.
	WALLET_ENCRYPTION_KEY: z
		.string()
		.regex(/^[0-9a-fA-F]{64}$/, "must be 32 bytes hex (64 hex chars)"),
	// HMAC key used to derive on-chain `incident_id` and `responder_id_hash`
	// values. Keeps off-chain UUIDs from being directly confirmable on chain
	// without the secret. Must be 32 bytes hex (64 hex chars). Generate with
	// `openssl rand -hex 32` and rotate only with deliberate care — rotation
	// breaks the off-chain ↔ on-chain PDA mapping for all existing events.
	CHAIN_HMAC_KEY: z
		.string()
		.regex(/^[0-9a-fA-F]{64}$/, "must be 32 bytes hex (64 hex chars)"),
	USDC_MINT_ADDRESS: z.string().min(1),
	// Expo push access token. Optional: Expo Go delivers without it; standalone
	// production builds and apps using FCM/APNs credentials need it set.
	EXPO_ACCESS_TOKEN: z.string().optional(),
	// HS256 secret for signing operator session JWTs. Must be at least 32 chars
	// (recommended: 64 hex chars from `openssl rand -hex 32`). Rotating this
	// invalidates every issued token, which is fine — operators just sign in
	// again with PIN.
	AUTH_SECRET: z.string().min(32),
	// JWT lifetime in seconds. Defaults to 30 days — operators are rarely
	// re-signed-in mid-shift; we lean on PIN at first launch + secure-store
	// caching the rest of the time.
	AUTH_TOKEN_TTL_SECS: z.coerce.number().int().positive().default(60 * 60 * 24 * 30),
	STT_PROVIDER: z.enum(["deepgram"]).default("deepgram"),
	DEEPGRAM_API_KEY: z.string().min(1),
	// Anthropic Messages API key for the agent runner (AD-6). Required because
	// the agent loop is non-optional for the briefing flow — there's no rule-
	// based fallback once we leave AD-5.
	ANTHROPIC_API_KEY: z.string().min(1),
	// Default Claude model. Sonnet 4.6 is the speed/intelligence sweet spot
	// for our 5-tool dispatch loop (~3x faster than Opus 4.7 on this task);
	// override to `claude-opus-4-7` in .env.local when intelligence matters
	// more than latency.
	ANTHROPIC_MODEL: z.string().default("claude-sonnet-4-6"),
	// Hard cap on agent loop iterations. The agent typically needs 3–5 turns
	// (classify → find vehicles → check responders → check active incidents →
	// draft briefing); 8 leaves headroom for retries and the rare extra lookup.
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
