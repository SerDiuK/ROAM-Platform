// Must match the backend's SOLANA_CLUSTER.
export const SOLANA_CLUSTER = "devnet";

export function solanaExplorerTxUrl(signature: string): string {
	return `https://explorer.solana.com/tx/${signature}?cluster=${SOLANA_CLUSTER}`;
}
