import { z } from "zod";
import { CoordSchema } from "./coord";
import { ResponderCapabilitySchema } from "./responder";

export const INCIDENT_URGENCIES = [1, 2, 3] as const;
export const IncidentUrgencySchema = z.union([
	z.literal(1),
	z.literal(2),
	z.literal(3),
]);
export type IncidentUrgency = z.infer<typeof IncidentUrgencySchema>;

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

export const AssignedSchema = z.object({
	vehicles: z.array(z.string()).default([]),
	responders: z.array(z.string()).default([]),
});
export type Assigned = z.infer<typeof AssignedSchema>;

export const IncidentClassificationSchema = z.object({
	incidentType: z.string(),
	urgency: IncidentUrgencySchema,
	location: CoordSchema.optional(),
	locationDescription: z.string().optional(),
	requiredCapabilities: z.array(ResponderCapabilitySchema),
});
export type IncidentClassification = z.infer<
	typeof IncidentClassificationSchema
>;

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
