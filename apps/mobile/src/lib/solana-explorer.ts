// Demo runs on devnet. The cluster is fixed here rather than read from
// SOLANA_RPC_URL because the explorer URL parameter is one of `mainnet-beta`,
// `devnet`, or `testnet` — derivation from a generic RPC URL would brittle.
// If we ever flip to mainnet, change this and the backend SOLANA_CLUSTER env
// in lockstep.
export const SOLANA_CLUSTER = "devnet";

export function solanaExplorerTxUrl(signature: string): string {
	return `https://explorer.solana.com/tx/${signature}?cluster=${SOLANA_CLUSTER}`;
}
