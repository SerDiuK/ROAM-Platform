import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { getCluster } from "@roam/solana-client";
import { Connection, clusterApiUrl, Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import type { FastifyBaseLogger } from "fastify";
import type { Config } from "../config.js";

export type SolanaContext = {
	connection: Connection;
	operator: Keypair;
};

// Builds the connection + operator keypair from config. Throws if
// SOLANA_OPERATOR_KEYPAIR is missing — used by request-path procedures
// (`dispatch.prepareResponseTx`) where there's no graceful degradation.
export function getSolanaContext(config: Config): SolanaContext {
	if (!config.SOLANA_OPERATOR_KEYPAIR) {
		throw new Error("SOLANA_OPERATOR_KEYPAIR not set");
	}
	const secretKey = bs58.decode(config.SOLANA_OPERATOR_KEYPAIR);
	const operator = Keypair.fromSecretKey(secretKey);
	const cluster = getCluster(config.SOLANA_CLUSTER);
	const connection = new Connection(
		cluster === "localnet" ? "http://localhost:8899" : clusterApiUrl(cluster),
	);
	return { connection, operator };
}

// Builds an AnchorProvider from SOLANA_OPERATOR_KEYPAIR + SOLANA_CLUSTER and
// runs `fn` against it. Returns null without throwing when the keypair is
// missing or anything fails — chain writes must never block the API request
// path (see CLAUDE.md "Solana writes are non-blocking"). Use `getSolanaContext`
// directly when the call site *does* need to fail loudly.
export async function withSolanaProvider<T>(
	config: Config,
	log: FastifyBaseLogger,
	fn: (provider: AnchorProvider) => Promise<T>,
): Promise<T | null> {
	if (!config.SOLANA_OPERATOR_KEYPAIR) {
		log.warn("SOLANA_OPERATOR_KEYPAIR not set — skipping chain write");
		return null;
	}
	try {
		const { connection, operator } = getSolanaContext(config);
		const provider = new AnchorProvider(connection, new Wallet(operator), {});
		return await fn(provider);
	} catch (err: unknown) {
		log.error(err, "Solana write failed (non-blocking)");
		return null;
	}
}
