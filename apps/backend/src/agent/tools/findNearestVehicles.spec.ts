import { randomUUID } from "node:crypto";
import type { VehicleStatus } from "@roam/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { getDefaultSpec, makeResponder } from "../../../test/factories.js";
import { ResponderModel } from "../../db/models/responder.js";
import { VehicleModel } from "../../db/models/vehicle.js";
import { findNearestVehiclesTool } from "./findNearestVehicles.js";
import type { AgentToolContext } from "./types.js";

const ctx = {
	log: {} as AgentToolContext["log"],
	incidentId: "inc-being-briefed",
} satisfies AgentToolContext;

const ORIGIN = { lat: 25.7617, lon: -80.1918 };

interface SeedSpec {
	callsign: string;
	lat: number;
	lon: number;
	status?: VehicleStatus;
	capabilities?: "medic"[];
}

async function seedVehicleWithResponder(spec: SeedSpec): Promise<string> {
	const vehicleSpec = await getDefaultSpec();
	const responder = await makeResponder({
		name: `RSP-${spec.callsign}-${randomUUID().slice(0, 4)}`,
	});
	if (spec.capabilities) {
		await ResponderModel.findByIdAndUpdate(responder._id, {
			capabilities: spec.capabilities,
		});
	}
	const vehicle = await new VehicleModel({
		callsign: spec.callsign,
		model: vehicleSpec._id,
		status: spec.status ?? "available",
		assignedResponderIds: [responder._id],
		lastTelemetry: {
			lat: spec.lat,
			lon: spec.lon,
			speed: 0,
			heading: 0,
			timestamp: new Date(),
		},
	}).save();
	return vehicle._id.toHexString();
}

beforeEach(async () => {
	await VehicleModel.syncIndexes();
});

describe("findNearestVehiclesTool", () => {
	it("returns up to 5 vehicles ordered by ascending distanceMeters", async () => {
		const nearId = await seedVehicleWithResponder({
			callsign: "V-NEAR",
			lat: 25.766,
			lon: -80.193,
			capabilities: ["medic"],
		});
		const midId = await seedVehicleWithResponder({
			callsign: "V-MID",
			lat: 25.772,
			lon: -80.182,
			capabilities: ["medic"],
		});
		const farId = await seedVehicleWithResponder({
			callsign: "V-FAR",
			lat: 25.788,
			lon: -80.17,
			capabilities: ["medic"],
		});

		const result = await findNearestVehiclesTool.handler(
			{ lat: ORIGIN.lat, lon: ORIGIN.lon, radiusKm: 50 },
			ctx,
		);

		expect(result).toHaveLength(3);
		expect(result.map((r) => r.id)).toEqual([nearId, midId, farId]);
		expect(result[0].callsign).toBe("V-NEAR");
		for (let i = 1; i < result.length; i++) {
			expect(result[i].distanceMeters).toBeGreaterThan(
				result[i - 1].distanceMeters,
			);
		}
		expect(result.length).toBeLessThanOrEqual(5);
	});

	it("returns available and checked-in vehicles, not locked or offline ones", async () => {
		const availableId = await seedVehicleWithResponder({
			callsign: "V-FREE",
			lat: 25.766,
			lon: -80.193,
			status: "available",
		});
		const crewedId = await seedVehicleWithResponder({
			callsign: "V-CREWED",
			lat: 25.767,
			lon: -80.194,
			status: "in_use",
		});
		await seedVehicleWithResponder({
			callsign: "V-LOCKED",
			lat: 25.768,
			lon: -80.195,
			status: "locked",
		});
		await seedVehicleWithResponder({
			callsign: "V-OFF",
			lat: 25.769,
			lon: -80.196,
			status: "offline",
		});

		const result = await findNearestVehiclesTool.handler(
			{ lat: ORIGIN.lat, lon: ORIGIN.lon, radiusKm: 50 },
			ctx,
		);

		expect(result.map((r) => r.id)).toEqual([availableId, crewedId]);
	});

	it("requiredCapabilities restricts to vehicles whose assigned responder has any matching capability", async () => {
		const medicId = await seedVehicleWithResponder({
			callsign: "V-MEDIC",
			lat: 25.766,
			lon: -80.193,
			capabilities: ["medic"],
		});

		const result = await findNearestVehiclesTool.handler(
			{
				lat: ORIGIN.lat,
				lon: ORIGIN.lon,
				radiusKm: 50,
				requiredCapabilities: ["medic"],
			},
			ctx,
		);

		expect(result.map((r) => r.id)).toEqual([medicId]);
	});

	it("returns an empty array when no responder anywhere has the required capability", async () => {
		await seedVehicleWithResponder({
			callsign: "V-NO-CAPS",
			lat: 25.766,
			lon: -80.193,
		});

		const result = await findNearestVehiclesTool.handler(
			{
				lat: ORIGIN.lat,
				lon: ORIGIN.lon,
				radiusKm: 50,
				requiredCapabilities: ["medic"],
			},
			ctx,
		);

		expect(result).toEqual([]);
	});

	it("returns an empty array when the radius excludes every vehicle", async () => {
		await seedVehicleWithResponder({
			callsign: "V-FAR",
			lat: 26.5,
			lon: -80.0,
			capabilities: ["medic"],
		});

		const result = await findNearestVehiclesTool.handler(
			{ lat: ORIGIN.lat, lon: ORIGIN.lon, radiusKm: 1 },
			ctx,
		);

		expect(result).toEqual([]);
	});
});
