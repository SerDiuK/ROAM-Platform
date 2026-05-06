import { z } from "zod";

// --- Telemetry ---
// `vehicleId` is the Vehicle's _id as a 24-char ObjectId hex string. The
// MQTT topic is keyed by callsign (`vehicles/{callsign}/telemetry`); the
// backend resolves the callsign to a vehicleId before persisting / broadcasting.
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

// --- MQTT ingest payload ---
// What the iot-bridge actually publishes. The backend resolves callsign →
// vehicleId before persisting and broadcasting via TelemetrySchema.
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

// --- Embedded telemetry snapshot (lives on Vehicle.lastTelemetry) ---
// No vehicleId — the parent Vehicle._id identifies it.
export const TelemetrySnapshotSchema = TelemetrySchema.omit({
	vehicleId: true,
});
export type TelemetrySnapshot = z.infer<typeof TelemetrySnapshotSchema>;
