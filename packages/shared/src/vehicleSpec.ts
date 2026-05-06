import { z } from "zod";

// --- Vehicle Spec (catalog: manufacturer, model name, image, performance specs) ---
export const VehicleSpecSchema = z.object({
	_id: z.string(), // 24-char ObjectId hex
	slug: z.string(), // e.g. "ambulance-type-1" — stable seed/lookup key
	manufacturer: z.string(),
	name: z.string(),
	imageUrl: z.string().url(),
	description: z.string().optional(),
	category: z.string().optional(),
	topSpeedKph: z.number().optional(),
	rangeKm: z.number().optional(),
	payloadKg: z.number().optional(),
	weightKg: z.number().optional(),
	drivetrain: z.string().optional(),
	batteryKwh: z.number().optional(),
	productUrl: z.string().url().optional(),
});
export type VehicleSpec = z.infer<typeof VehicleSpecSchema>;
