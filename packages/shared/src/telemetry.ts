import { z } from "zod";

export const TelemetrySchema = z.object({
	vehicleId: z.string(),
	lat: z.number(),
	lon: z.number(),
	speed: z.number(),
	heading: z.number().min(0).max(360),
	batteryPct: z.number().min(0).max(100).optional(),
	timestamp: z.coerce.date(),
});
export type Telemetry = z.infer<typeof TelemetrySchema>;

export const TelemetryIngestSchema = z.object({
	callsign: z.string(),
	lat: z.number(),
	lon: z.number(),
	speed: z.number(),
	heading: z.number().min(0).max(360),
	batteryPct: z.number().min(0).max(100).optional(),
	timestamp: z.coerce.date(),
});
export type TelemetryIngest = z.infer<typeof TelemetryIngestSchema>;

export const TelemetrySnapshotSchema = TelemetrySchema.omit({
	vehicleId: true,
});
export type TelemetrySnapshot = z.infer<typeof TelemetrySnapshotSchema>;
