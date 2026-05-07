import { z } from "zod";

// Canonical demo simulator fleet. Owned by @roam/shared so backend can seed
// it into Mongo and sim-fleet can drive telemetry without duplicating the list.
// Every vehicle resolves to the single seeded VehicleSpec (`ambulance-type-1`)
// — the seed script wires that up, no per-vehicle slug needed.
export const DemoFleetVehicleSchema = z.object({
	routeFile: z.string().min(1),
	callsign: z.string().min(1),
	responderName: z.string().min(1),
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
		responderName: "THOMAS-1",
		batteryPct: 87,
		seedTelemetry: { lat: 25.806, lon: -80.193 },
	},
	{
		routeFile: "patrol_bravo.json",
		autoCheckin: true,
		callsign: "MEDIC-2",
		responderName: "RSP-2",
		batteryPct: 72,
		seedTelemetry: { lat: 25.821, lon: -80.184 },
	},
];
