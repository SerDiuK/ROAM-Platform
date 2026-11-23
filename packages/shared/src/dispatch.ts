import { z } from "zod";

export const DISPATCH_DECISION_MAKERS = ["human", "ai-auto"] as const;
const DispatchDecisionMakerSchema = z.enum(DISPATCH_DECISION_MAKERS);

export const DISPATCH_STATUSES = [
	"pending",
	"claimed",
	"cleared",
	"expired",
	"cancelled",
] as const;
const DispatchStatusSchema = z.enum(DISPATCH_STATUSES);

export const DISPATCH_PUSH_CHANNEL = "dispatch";

export const DispatchSchema = z.object({
	_id: z.string(),
	incidentId: z.string(),
	briefingId: z.string(),
	decisionMaker: DispatchDecisionMakerSchema,
	decidedBy: z.string().optional(),
	decidedAt: z.coerce.date(),
	assignedVehicleIds: z.array(z.string()),
	assignedResponderIds: z.array(z.string()),
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

export const DispatchClearRequestSchema = z.object({
	dispatchId: z.string(),
});

export const PrepareClearTxRequestSchema = z.object({
	dispatchId: z.string(),
});

export const PrepareClearTxResponseSchema = z.object({
	serializedTx: z.string(),
	recentBlockhash: z.string(),
	expiresAt: z.string(),
});

export const CommitSignedClearRequestSchema = z.object({
	dispatchId: z.string(),
	signature: z.string().min(1),
});

export const DispatchConfirmRequestSchema = z.object({
	briefingId: z.string(),
	decisionMaker: DispatchDecisionMakerSchema,
	decidedBy: z.string().optional(),
	requiredAccepts: z.number().int().min(1).default(1),
	expiresInSecs: z.number().int().min(1).default(60),
});
