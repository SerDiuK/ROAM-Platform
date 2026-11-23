import { vi } from "vitest";
import { withSolanaProvider } from "../../src/services/solana.js";

export const mockedWithSolanaProvider = vi.mocked(withSolanaProvider);

export function resetSolanaMock(): void {
	mockedWithSolanaProvider.mockReset();
	mockedWithSolanaProvider.mockResolvedValue(null);
}

export function makeSolanaSucceed(txSig: string): void {
	mockedWithSolanaProvider.mockResolvedValue(txSig);
}
