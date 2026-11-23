import { z } from "zod";

export const VehicleSpecSchema = z.object({
	_id: z.string(),
	slug: z.string(),
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
