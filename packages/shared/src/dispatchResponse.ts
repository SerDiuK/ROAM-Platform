import { z } from "zod";
import { DispatchSchema } from "./dispatch";

export const DISPATCH_DECISIONS = ["accept", "decline"] as const;
const DispatchDecisionSchema = z.enum(DISPATCH_DECISIONS);

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

export const PrepareResponseTxResponseSchema = z.object({
	serializedTx: z.string(),
	recentBlockhash: z.string(),
	expiresAt: z.string(),
});

export const CommitSignedResponseRequestSchema = z.object({
	dispatchId: z.string(),
	decision: DispatchDecisionSchema,
	signature: z.string().min(1),
	declineReason: z.string().optional(),
});

export const CommitSignedResponseResponseSchema = z.object({
	response: DispatchResponseSchema,
	dispatch: DispatchSchema,
});
