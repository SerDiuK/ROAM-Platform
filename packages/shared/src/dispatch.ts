import { z } from "zod";

export const DISPATCH_DECISION_MAKERS = ["human", "ai-auto"] as const;
export const DispatchDecisionMakerSchema = z.enum(DISPATCH_DECISION_MAKERS);
export type DispatchDecisionMaker = z.infer<typeof DispatchDecisionMakerSchema>;

export const DISPATCH_STATUSES = [
	"pending",
	"claimed",
	"cleared",
	"expired",
	"cancelled",
] as const;
export const DispatchStatusSchema = z.enum(DISPATCH_STATUSES);
export type DispatchStatus = z.infer<typeof DispatchStatusSchema>;

export const DispatchSchema = z.object({
	_id: z.string(),
	incidentId: z.string(),
	briefingId: z.string(),
	decisionMaker: DispatchDecisionMakerSchema,
	decidedBy: z.string().optional(),
	decidedAt: z.coerce.date(),
	assignedVehicleIds: z.array(z.string()),
	assignedResponderIds: z.array(z.string()),
	payoutUsdc: z.number(),
	requiredAccepts: z.number().int().min(1),
	status: DispatchStatusSchema,
	claimedByResponderIds: z.array(z.string()),
	expiresAt: z.coerce.date(),
});
export type Dispatch = z.infer<typeof DispatchSchema>;

export const DispatchListRequestSchema = z
	.object({
		includeCleared: z.boolean().default(false),
		limit: z.number().int().min(1).max(200).default(50),
	})
	.optional();
export type DispatchListRequest = z.infer<typeof DispatchListRequestSchema>;

export const DispatchClearRequestSchema = z.object({
	dispatchId: z.string(),
	clearedBy: z.string().optional(),
});
export type DispatchClearRequest = z.infer<typeof DispatchClearRequestSchema>;

export const PrepareClearTxRequestSchema = z.object({
	dispatchId: z.string(),
});
export type PrepareClearTxRequest = z.infer<typeof PrepareClearTxRequestSchema>;

export const PrepareClearTxResponseSchema = z.object({
	serializedTx: z.string(),
	recentBlockhash: z.string(),
	expiresAt: z.string(),
});
export type PrepareClearTxResponse = z.infer<
	typeof PrepareClearTxResponseSchema
>;

export const CommitSignedClearRequestSchema = z.object({
	dispatchId: z.string(),
	signature: z.string().min(1),
});
export type CommitSignedClearRequest = z.infer<
	typeof CommitSignedClearRequestSchema
>;

export const DispatchConfirmRequestSchema = z.object({
	briefingId: z.string(),
	decisionMaker: DispatchDecisionMakerSchema,
	decidedBy: z.string().optional(),
	requiredAccepts: z.number().int().min(1).default(1),
	expiresInSecs: z.number().int().min(1).default(60),
});
export type DispatchConfirmRequest = z.infer<
	typeof DispatchConfirmRequestSchema
>;
