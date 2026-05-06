import { z } from "zod";

// --- Payout ---
// Recorded once the USDC SPL transfer is initiated via the wallet provider.
// `solanaTxSignature` is the transfer tx; the tx itself is the on-chain proof,
// no separate program log needed.
export const PAYOUT_STATUSES = ["pending", "settled", "failed"] as const;
export const PayoutStatusSchema = z.enum(PAYOUT_STATUSES);
export type PayoutStatus = z.infer<typeof PayoutStatusSchema>;

export const PayoutSchema = z.object({
	_id: z.string(),
	dispatchId: z.string(),
	responderId: z.string(),
	recipientWalletAddress: z.string(),
	amountUsdc: z.number(),
	status: PayoutStatusSchema,
	initiatedAt: z.coerce.date(),
	settledAt: z.coerce.date().optional(),
	solanaTxSignature: z.string().optional(),
	error: z.string().optional(),
});
export type Payout = z.infer<typeof PayoutSchema>;
