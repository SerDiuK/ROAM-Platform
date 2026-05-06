import { z } from "zod";
import { TelemetrySnapshotSchema } from "./telemetry";
import { VehicleSpecSchema } from "./vehicleSpec";

// --- Vehicle Status ---
export const VEHICLE_STATUSES = [
	"available",
	"in_use",
	"locked",
	"offline",
] as const;
export const VehicleStatusSchema = z.enum(VEHICLE_STATUSES);
export type VehicleStatus = z.infer<typeof VehicleStatusSchema>;

// --- Vehicle ---
// `_id` is a 24-char ObjectId hex string. `callsign` is the human-readable
// label and the MQTT topic key. `currentResponderId` is a wire-only field
// joined at read time from `Responder.currentVehicleId` (AD-22 — the off-chain
// Session collection has been removed); the dashboard joins it against the
// responder list to render a label.
export const VehicleSchema = z.object({
	_id: z.string(),
	callsign: z.string(),
	model: VehicleSpecSchema,
	status: VehicleStatusSchema,
	currentResponderId: z.string().nullable().optional(),
	assignedResponderIds: z.array(z.string()).optional(),
	lastTelemetry: TelemetrySnapshotSchema.optional(),
	createdAt: z.coerce.date(),
});
export type Vehicle = z.infer<typeof VehicleSchema>;
