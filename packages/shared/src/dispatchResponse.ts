import { z } from "zod";
import { DispatchSchema } from "./dispatch";

export const DISPATCH_DECISIONS = ["accept", "decline"] as const;
export const DispatchDecisionSchema = z.enum(DISPATCH_DECISIONS);
export type DispatchDecision = z.infer<typeof DispatchDecisionSchema>;

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
