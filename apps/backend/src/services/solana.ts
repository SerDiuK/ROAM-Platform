import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { Connection, clusterApiUrl, Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import type { FastifyBaseLogger } from "fastify";
import type { Config } from "../config.js";

type SolanaContext = {
	connection: Connection;
	operator: Keypair;
};

export function buildConnection(config: Config): Connection {
	const url =
		config.SOLANA_CLUSTER === "localnet"
			? "http://localhost:8899"
			: clusterApiUrl(config.SOLANA_CLUSTER);
	return new Connection(url, "confirmed");
}

export function getSolanaContext(config: Config): SolanaContext {
	if (!config.SOLANA_OPERATOR_KEYPAIR) {
		throw new Error("SOLANA_OPERATOR_KEYPAIR not set");
	}
	const secretKey = bs58.decode(config.SOLANA_OPERATOR_KEYPAIR);
	const operator = Keypair.fromSecretKey(secretKey);
	return { connection: buildConnection(config), operator };
}

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
