import { randomBytes } from "node:crypto";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { describe, expect, it } from "vitest";
import type { Config } from "../config.js";
import { createWalletProvider, EmbeddedSolanaProvider } from "./index.js";

function makeFakeConfig(overrides: Partial<Config> = {}): Config {
	const agent = Keypair.generate();
	return {
		PORT: 3001,
		MONGODB_URL: "mongodb://localhost/test",
		MQTT_PORT: 1883,
		SOLANA_CLUSTER: "devnet",
		SOLANA_OPERATOR_KEYPAIR: bs58.encode(agent.secretKey),
		STALE_SESSION_SECS: 30,
		DASHBOARD_ORIGINS: ["http://localhost:3000"],
		WALLET_PROVIDER: "embedded-solana",
		WALLET_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
		USDC_MINT_ADDRESS: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
		STT_PROVIDER: "deepgram",
		DEEPGRAM_API_KEY: "fake",
		...overrides,
	} as Config;
}

describe("createWalletProvider", () => {
	it("returns an EmbeddedSolanaProvider when WALLET_PROVIDER='embedded-solana'", () => {
		const provider = createWalletProvider(makeFakeConfig());
		expect(provider).toBeInstanceOf(EmbeddedSolanaProvider);
	});

	it("throws when SOLANA_OPERATOR_KEYPAIR is missing for embedded-solana", () => {
		const config = makeFakeConfig({ SOLANA_OPERATOR_KEYPAIR: undefined });
		expect(() => createWalletProvider(config)).toThrow(
			/SOLANA_OPERATOR_KEYPAIR is required/,
		);
	});

	it("constructs a provider whose agentAddress matches the bs58-encoded keypair pubkey", () => {
		const agent = Keypair.generate();
		const config = makeFakeConfig({
			SOLANA_OPERATOR_KEYPAIR: bs58.encode(agent.secretKey),
		});
		const provider = createWalletProvider(config);
		expect(provider).toBeInstanceOf(EmbeddedSolanaProvider);
		expect((provider as EmbeddedSolanaProvider).agentAddress).toBe(
			agent.publicKey.toBase58(),
		);
	});

	it("accepts SOLANA_CLUSTER='localnet' (factory builds without throwing)", () => {
		const provider = createWalletProvider(
			makeFakeConfig({ SOLANA_CLUSTER: "localnet" }),
		);
		expect(provider).toBeInstanceOf(EmbeddedSolanaProvider);
	});

	it("accepts SOLANA_CLUSTER='mainnet-beta' (factory builds without throwing)", () => {
		const provider = createWalletProvider(
			makeFakeConfig({ SOLANA_CLUSTER: "mainnet-beta" }),
		);
		expect(provider).toBeInstanceOf(EmbeddedSolanaProvider);
	});
});
