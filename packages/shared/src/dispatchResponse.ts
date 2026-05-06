import { z } from "zod";

// --- Dispatch Response ---
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
});
export type DispatchResponse = z.infer<typeof DispatchResponseSchema>;

// --- Dispatch Respond Request ---
// A responder's accept or decline for a specific dispatch. The unique compound
// index on (dispatchId, responderId) at the persistence layer is what makes
// the call idempotent; a duplicate surfaces as a CONFLICT to the caller.
export const DispatchRespondRequestSchema = z.object({
	dispatchId: z.string(),
	responderId: z.string(),
	decision: DispatchDecisionSchema,
	declineReason: z.string().optional(),
});
export type DispatchRespondRequest = z.infer<
	typeof DispatchRespondRequestSchema
>;
