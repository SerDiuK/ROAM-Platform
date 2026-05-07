import { z } from "zod";
import { DispatchSchema } from "./dispatch";

// --- Dispatch Response ---
export const DISPATCH_DECISIONS = ["accept", "decline"] as const;
export const DispatchDecisionSchema = z.enum(DISPATCH_DECISIONS);
export type DispatchDecision = z.infer<typeof DispatchDecisionSchema>;

// `solanaTxSignature` + `attestorPubkey` are populated by the SIWS
// commitSignedResponse path. The Seeker pubkey on `attestorPubkey` is the
// chain-of-custody primitive the demo cares about — it proves the *responder*
// personally signed this attestation, not the backend.
export const DispatchResponseSchema = z.object({
	_id: z.string(),
	dispatchId: z.string(),
	responderId: z.string(),
	decision: DispatchDecisionSchema,
	declineReason: z.string().optional(),
	respondedAt: z.coerce.date(),
	solanaTxSignature: z.string().optional(),
	attestorPubkey: z.string().optional(),
});
export type DispatchResponse = z.infer<typeof DispatchResponseSchema>;

// --- Prepare response tx ---
// Mobile asks the backend to build the unsigned `record_event` tx, partial-
// signed as fee_payer. Backend validates idempotency / race / expiry without
// persisting; mobile signs as attestor via Mobile Wallet Adapter, sends to
// chain, then commits via commitSignedResponse with the resulting signature.
export const PrepareResponseTxRequestSchema = z.object({
	dispatchId: z.string(),
	decision: DispatchDecisionSchema,
	declineReason: z.string().optional(),
});
export type PrepareResponseTxRequest = z.infer<
	typeof PrepareResponseTxRequestSchema
>;

export const PrepareResponseTxResponseSchema = z.object({
	serializedTx: z.string(),
	recentBlockhash: z.string(),
	expiresAt: z.string(),
});
export type PrepareResponseTxResponse = z.infer<
	typeof PrepareResponseTxResponseSchema
>;

// --- Commit signed response ---
// Posted after mobile has sent the tx to chain. Backend persists the
// DispatchResponse row, atomic-claims the dispatch on accept, and broadcasts.
export const CommitSignedResponseRequestSchema = z.object({
	dispatchId: z.string(),
	decision: DispatchDecisionSchema,
	signature: z.string().min(1),
	declineReason: z.string().optional(),
});
export type CommitSignedResponseRequest = z.infer<
	typeof CommitSignedResponseRequestSchema
>;

export const CommitSignedResponseResponseSchema = z.object({
	response: DispatchResponseSchema,
	dispatch: DispatchSchema,
});
export type CommitSignedResponseResponse = z.infer<
	typeof CommitSignedResponseResponseSchema
>;
