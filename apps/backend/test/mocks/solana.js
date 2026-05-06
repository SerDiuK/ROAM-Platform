import { withSolanaProvider } from "../../src/services/solana.js";
export const mockedWithSolanaProvider = withSolanaProvider;
export function resetSolanaMock() {
    mockedWithSolanaProvider.mockReset();
    mockedWithSolanaProvider.mockResolvedValue(null);
}
export function makeSolanaSucceed(txSig) {
    mockedWithSolanaProvider.mockResolvedValue(txSig);
}
//# sourceMappingURL=solana.js.map