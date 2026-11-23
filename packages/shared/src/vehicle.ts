import { z } from "zod";
import { TelemetrySnapshotSchema } from "./telemetry";
import { VehicleSpecSchema } from "./vehicleSpec";

export const VEHICLE_STATUSES = [
	"available",
	"in_use",
	"locked",
	"offline",
] as const;
export const VehicleStatusSchema = z.enum(VEHICLE_STATUSES);
export type VehicleStatus = z.infer<typeof VehicleStatusSchema>;

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
