import { z } from "zod";

// --- Dispatch Decision Maker ---
export const DISPATCH_DECISION_MAKERS = ["human", "ai-auto"] as const;
export const DispatchDecisionMakerSchema = z.enum(DISPATCH_DECISION_MAKERS);
export type DispatchDecisionMaker = z.infer<typeof DispatchDecisionMakerSchema>;

// --- Dispatch Status ---
// Lifecycle: pending → claimed → cleared (terminal). Or pending → expired
// (nobody accepted in time) / cancelled (manual abort). `cleared` is the
// "scene cleared, response complete" terminal state — the demo scenario's
// fourth on-chain event ("Medic 12 cleared scene").
export const DISPATCH_STATUSES = [
	"pending",
	"claimed",
	"cleared",
	"expired",
	"cancelled",
] as const;
export const DispatchStatusSchema = z.enum(DISPATCH_STATUSES);
export type DispatchStatus = z.infer<typeof DispatchStatusSchema>;

// --- Dispatch ---
// Created when a briefing is confirmed (by dispatcher or auto-mode). Drives
// the push fan-out and the on-chain incident event log (one `dispatched`
// event per assigned responder). `decidedBy` is the dispatcher's responderId
// for human decisions; absent for ai-auto.
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

// --- Dispatch List Request ---
// `dispatch.list` defaults to active states (pending + claimed) — the common
// dispatcher view. When `includeCleared` is true, also returns recently
// cleared/expired/cancelled dispatches (capped at `limit`) so callers can
// look up terminal-state dispatches by prefix.
export const DispatchListRequestSchema = z
	.object({
		includeCleared: z.boolean().default(false),
		limit: z.number().int().min(1).max(200).default(50),
	})
	.optional();
export type DispatchListRequest = z.infer<typeof DispatchListRequestSchema>;

// --- Dispatch Clear Request ---
// Mark a claimed dispatch as cleared (scene cleared, response complete).
// Side-effect: flips the linked incident to status='resolved' and stamps
// `clearedAt`. Reject from any non-claimed status — pending dispatches haven't
// been picked up; expired/cancelled are terminal already.
export const DispatchClearRequestSchema = z.object({
	dispatchId: z.string(),
	clearedBy: z.string().optional(),
});
export type DispatchClearRequest = z.infer<typeof DispatchClearRequestSchema>;

// --- Dispatch Confirm Request ---
// Confirm a briefing → create the Dispatch + fan out push. `decidedBy` is the
// dispatcher's responderId for human decisions (omit for ai-auto). Defaults
// give the demo a single-accept, 60-second window if the caller doesn't set
// them; both are tunable per-request for the AI-auto flow that may want a
// shorter expiry or multi-accept assignment.
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
