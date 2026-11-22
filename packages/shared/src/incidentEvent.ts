import { z } from "zod";

// Array position is the on-chain event_kind seed byte: don't reorder.
export const INCIDENT_EVENT_KINDS = [
	"received",
	"dispatched",
	"accepted",
	"rejected",
	"arrived",
	"cleared",
] as const;
export const IncidentEventKindSchema = z.enum(INCIDENT_EVENT_KINDS);
export type IncidentEventKind = z.infer<typeof IncidentEventKindSchema>;

export const INCIDENT_EVENT_KIND_TO_INDEX: Record<IncidentEventKind, number> = {
	received: 0,
	dispatched: 1,
	accepted: 2,
	rejected: 3,
	arrived: 4,
	cleared: 5,
};

export function incidentEventKindFromIndex(index: number): IncidentEventKind {
	const kind = INCIDENT_EVENT_KINDS[index];
	if (!kind) {
		throw new Error(`Unknown event_kind index ${index}`);
	}
	return kind;
}

export const IncidentEventPayloadSchema = z
	.object({
		briefingId: z.string().optional(),
		dispatchId: z.string().optional(),
		declineReason: z.string().optional(),
		vehicleId: z.string().optional(),
		distanceM: z.number().optional(),
	})
	.partial();
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
