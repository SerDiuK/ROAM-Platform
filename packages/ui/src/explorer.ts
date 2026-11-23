import { DEMO_CLUSTER } from "@roam/shared";

export function solanaExplorerTxUrl(signature: string): string {
	return `https://explorer.solana.com/tx/${signature}?cluster=${DEMO_CLUSTER}`;
}
