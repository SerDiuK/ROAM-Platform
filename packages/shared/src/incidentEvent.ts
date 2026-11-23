import { z } from "zod";

export const INCIDENT_EVENT_KINDS = [
	"received",
	"dispatched",
	"accepted",
	"rejected",
	"arrived",
	"cleared",
] as const;
const IncidentEventKindSchema = z.enum(INCIDENT_EVENT_KINDS);
export type IncidentEventKind = z.infer<typeof IncidentEventKindSchema>;

const IncidentEventPayloadSchema = z.object({
	briefingId: z.string().optional(),
	dispatchId: z.string().optional(),
	declineReason: z.string().optional(),
});
export type IncidentEventPayload = z.infer<typeof IncidentEventPayloadSchema>;

export const IncidentEventSchema = z.object({
	_id: z.string(),
	incidentId: z.string(),
	kind: IncidentEventKindSchema,
	responderId: z.string().nullable().optional(),
	occurredAt: z.coerce.date(),
	payload: IncidentEventPayloadSchema.optional(),
	solanaTxSignature: z.string().optional(),
});
export type IncidentEvent = z.infer<typeof IncidentEventSchema>;
