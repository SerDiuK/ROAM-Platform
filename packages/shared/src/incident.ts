import { z } from "zod";
import { CoordSchema } from "./coord";
import { ResponderCapabilitySchema } from "./responder";

// --- Incident Urgency ---
// US ambulance priority system: 1 = immediate/life-threatening (lights & sirens),
// 2 = urgent, 3 = non-urgent. Stored as a number end-to-end (Mongoose `Number`
// enum, Zod numeric union — `z.enum` is string-only).
export const INCIDENT_URGENCIES = [1, 2, 3] as const;
export const IncidentUrgencySchema = z.union([
	z.literal(1),
	z.literal(2),
	z.literal(3),
]);
export type IncidentUrgency = z.infer<typeof IncidentUrgencySchema>;

// --- Incident Status ---
// `arrived` is reserved between `responding` and `resolved` for the future
// proximity-check plan; nothing flips an incident to `arrived` today.
export const INCIDENT_STATUSES = [
	"live",
	"pending",
	"responding",
	"arrived",
	"resolved",
	"cancelled",
] as const;
export const IncidentStatusSchema = z.enum(INCIDENT_STATUSES);
export type IncidentStatus = z.infer<typeof IncidentStatusSchema>;

// --- Assigned units ---
// Responder IDs are UUID strings, vehicle IDs are hex ObjectId strings — both
// are `z.string()` at the wire layer.
export const AssignedSchema = z.object({
	vehicles: z.array(z.string()).default([]),
	responders: z.array(z.string()).default([]),
});
export type Assigned = z.infer<typeof AssignedSchema>;

// --- Incident Classification ---
// The agent's structured read of the incident. `location` is the extracted
// scene location (not the caller's location), populated when the agent can
// resolve it from the transcript.
export const IncidentClassificationSchema = z.object({
	incidentType: z.string(),
	urgency: IncidentUrgencySchema,
	location: CoordSchema.optional(),
	locationDescription: z.string().optional(),
	requiredCapabilities: z.array(ResponderCapabilitySchema),
});
export type IncidentClassification = z.infer<typeof IncidentClassificationSchema>;

// --- Incident ---
// Full transcript stays in MongoDB; `transcriptHash` (sha256 hex) is what gets
// recorded on Solana. `classification` is filled in by the agent after the
// first pass and can be re-evaluated as the call evolves.
// `dispatchedAt` is stamped when the dispatcher confirms the dispatch (status
// transitions from pending → responding); `clearedAt` is stamped when the
// last unit clears scene (status → resolved). Both are optional because
// incidents may be cancelled before they reach those states.
export const IncidentSchema = z.object({
	_id: z.string(),
	callStartedAt: z.coerce.date(),
	transcript: z.string(),
	transcriptHash: z.string(),
	classification: IncidentClassificationSchema.optional(),
	status: IncidentStatusSchema,
	assigned: AssignedSchema,
	dispatchedAt: z.coerce.date().optional(),
	clearedAt: z.coerce.date().optional(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});
export type Incident = z.infer<typeof IncidentSchema>;

// --- Incident Ingest Request ---
// Exactly one of audio or transcript must be provided. When `audio` is set,
// `mimeType` is required (Deepgram needs it to pick the decoder). `audio` is a
// base64 string — orPC's HTTP layer carries it as JSON, the server decodes to
// a Buffer before handing off to the transcriber.
export const IncidentIngestRequestSchema = z
	.object({
		audio: z.string().optional(),
		mimeType: z.string().optional(),
		transcript: z.string().optional(),
	})
	.refine(
		(val) =>
			(val.audio !== undefined && val.transcript === undefined) ||
			(val.audio === undefined && val.transcript !== undefined),
		{ message: "Provide exactly one of audio or transcript" },
	)
	.refine((val) => !val.audio || !!val.mimeType, {
		message: "mimeType is required when audio is provided",
	});
export type IncidentIngestRequest = z.infer<typeof IncidentIngestRequestSchema>;
