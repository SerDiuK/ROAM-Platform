import { z } from "zod";

export const DemoFleetVehicleSchema = z.object({
	routeFile: z.string().min(1),
	callsign: z.string().min(1),
	responderName: z.string().min(1),
	modelSlug: z.string().optional(),
	autoCheckin: z.boolean().optional(),
	batteryPct: z.number().min(0).max(100).optional(),
	initialStatus: z.string().optional(),
	seedTelemetry: z.object({ lat: z.number(), lon: z.number() }).optional(),
});

export type DemoFleetVehicle = z.infer<typeof DemoFleetVehicleSchema>;

export const DemoFleetSchema = z.array(DemoFleetVehicleSchema).min(1);

export const DEMO_FLEET: DemoFleetVehicle[] = [
	{
		routeFile: "patrol_alpha.json",
		autoCheckin: true,
		callsign: "MEDIC-1",
		responderName: "THOMAS-1",
		modelSlug: "ambulance-type-1",
		batteryPct: 87,
		seedTelemetry: { lat: 25.806, lon: -80.193 },
	},
	{
		routeFile: "patrol_bravo.json",
		autoCheckin: true,
		callsign: "MEDIC-2",
		responderName: "RSP-2",
		modelSlug: "ambulance-type-1",
		batteryPct: 72,
		seedTelemetry: { lat: 25.821, lon: -80.184 },
	},
];
