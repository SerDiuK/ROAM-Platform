import type { Mock } from "vitest";
import { withSolanaProvider } from "../../src/services/solana.js";

export const mockedWithSolanaProvider = withSolanaProvider as unknown as Mock;

export function resetSolanaMock(): void {
	mockedWithSolanaProvider.mockReset();
	mockedWithSolanaProvider.mockResolvedValue(null);
}

export function makeSolanaSucceed(txSig: string): void {
	mockedWithSolanaProvider.mockResolvedValue(txSig);
}
