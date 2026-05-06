import { z } from "zod";

// Canonical demo simulator fleet. Owned by @roam/shared so backend can seed
// it into Mongo and sim-fleet can drive telemetry without duplicating the list.
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

// seedTelemetry positions cluster the medics within ~3km of the demo scene at
// Biscayne Blvd & NE 36th St (≈25.812 N, -80.190 W) so the agent's
// find_nearest_vehicles tool can return them on a freshly-seeded DB without
// sim-fleet having to be running. Once sim-fleet starts, real telemetry
// overrides these via the MQTT pipeline.
export const DEMO_FLEET: DemoFleetVehicle[] = [
	{
		routeFile: "patrol_alpha.json",
		autoCheckin: true,
		callsign: "MEDIC-1",
		responderName: "RSP-VAUGHN",
		modelSlug: "ambulance-type-1",
		batteryPct: 87,
		seedTelemetry: { lat: 25.806, lon: -80.193 },
	},
	{
		routeFile: "patrol_bravo.json",
		autoCheckin: true,
		callsign: "MEDIC-2",
		responderName: "RSP-REYES",
		modelSlug: "ambulance-type-1",
		batteryPct: 72,
		seedTelemetry: { lat: 25.821, lon: -80.184 },
	},
	{
		routeFile: "convoy.json",
		autoCheckin: true,
		callsign: "MEDIC-3",
		responderName: "RSP-CHEN",
		modelSlug: "ambulance-type-1",
		batteryPct: 91,
		seedTelemetry: { lat: 25.798, lon: -80.205 },
	},
	{
		routeFile: "stationary.json",
		autoCheckin: false,
		callsign: "MEDIC-4",
		responderName: "RSP-MORALES",
		modelSlug: "ambulance-type-1",
		batteryPct: 55,
		seedTelemetry: { lat: 25.815, lon: -80.180 },
	},
	{
		routeFile: "dead_battery.json",
		callsign: "MEDIC-5",
		responderName: "RSP-KOWALSKI",
		modelSlug: "ambulance-type-1",
		autoCheckin: false,
		batteryPct: 0,
		initialStatus: "locked",
		seedTelemetry: { lat: 25.808252, lon: -80.198233 },
	},
];
