import { z } from "zod";

// --- Incident Event Kind ---
// On-chain `event_kind` discriminator (u8). Order matters — the numeric
// position is what the Solana program uses as the seed byte. Don't reorder.
export const INCIDENT_EVENT_KINDS = [
	"received", // 0 — incident-scoped (no responder)
	"dispatched", // 1 — per responder
	"accepted", // 2 — per responder
	"rejected", // 3 — per responder
	"arrived", // 4 — per responder; reserved, fired by the future proximity-check plan
	"cleared", // 5 — incident-scoped (no responder)
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

// --- Incident Event Payload ---
// Event-specific data carried alongside the on-chain hash. Off-chain only —
// the chain just stores `payload_hash`. Keep these fields lean: the dashboard
// + mobile timeline don't need the original briefing here, just enough context
// to render a row.
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

// --- Incident Event ---
// `responderId` is null for incident-scoped events (`received`, `cleared`).
// `solanaTxSignature` is patched onto the doc once the chain write completes
// — null/undefined while the write is in flight or if it failed (the Mongo
// row is canonical; on-chain is the audit trail).
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
