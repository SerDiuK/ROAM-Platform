import { Connection, Keypair, PublicKey, clusterApiUrl } from "@solana/web3.js";
import bs58 from "bs58";
import type { Config } from "../config.js";
import { getCluster } from "@roam/solana-client";
import { EmbeddedSolanaProvider } from "./embedded.js";
import type { WalletProvider } from "./provider.js";

export { WalletError } from "./provider.js";
export type { WalletProvider } from "./provider.js";
export { EmbeddedSolanaProvider } from "./embedded.js";
export { CrossmintProvider } from "./crossmint.js";

// Builds the active wallet provider from config. Embedded-Solana is the only
// option in use today (Crossmint cannot host Solana devnet wallets — see
// docs/ROAM-Tasks.md AD-2). The CrossmintProvider implementation is kept in the
// repo as a future option for mainnet operator UX.
export function createWalletProvider(config: Config): WalletProvider {
	switch (config.WALLET_PROVIDER) {
		case "embedded-solana": {
			if (!config.SOLANA_OPERATOR_KEYPAIR) {
				throw new Error(
					"SOLANA_OPERATOR_KEYPAIR is required for the embedded-solana wallet provider (it acts as the agent keypair)",
				);
			}
			const cluster = getCluster(config.SOLANA_CLUSTER);
			const connection = new Connection(
				cluster === "localnet" ? "http://localhost:8899" : clusterApiUrl(cluster),
				"confirmed",
			);
			const agentKeypair = Keypair.fromSecretKey(
				bs58.decode(config.SOLANA_OPERATOR_KEYPAIR),
			);
			return new EmbeddedSolanaProvider({
				connection,
				agentKeypair,
				usdcMint: new PublicKey(config.USDC_MINT_ADDRESS),
				encryptionKey: Buffer.from(config.WALLET_ENCRYPTION_KEY, "hex"),
			});
		}
		default: {
			const exhaustive: never = config.WALLET_PROVIDER;
			throw new Error(`Unsupported WALLET_PROVIDER: ${exhaustive as string}`);
		}
	}
}
