import type mongoose from "mongoose";
import { beforeEach, describe, expect, it } from "vitest";
import {
	getDefaultSpec,
	makeFakeBroadcaster,
	makeFakeLogger,
	makeVehicle,
} from "../../test/factories.js";
import { TelemetryModel } from "../db/models/telemetry.js";
import { VehicleModel } from "../db/models/vehicle.js";
import { handleTelemetry } from "./handlers.js";

let defaultModelId: mongoose.Types.ObjectId;

beforeEach(async () => {
	const spec = await getDefaultSpec();
	defaultModelId = spec._id as unknown as mongoose.Types.ObjectId;
});

describe("handleTelemetry", () => {
	it("upserts vehicle, writes telemetry, broadcasts on valid payload", async () => {
		const broadcaster = makeFakeBroadcaster();
		const logger = makeFakeLogger();
		const callsign = "V-INGEST-1";
		const payload = JSON.stringify({
			callsign,
			lat: 25.79,
			lon: -80.19,
			speed: 12.4,
			heading: 180,
			batteryPct: 87,
			timestamp: new Date("2026-05-04T10:00:00Z").toISOString(),
		});

		await handleTelemetry(
			Buffer.from(payload),
			callsign,
			defaultModelId,
			broadcaster as unknown as Parameters<typeof handleTelemetry>[3],
			logger as unknown as Parameters<typeof handleTelemetry>[4],
		);

		const vehicle = await VehicleModel.findOne({ callsign });
		expect(vehicle).not.toBeNull();
		expect(vehicle?.lastTelemetry?.lat).toBeCloseTo(25.79);
		expect(vehicle?.lastTelemetry?.batteryPct).toBe(87);

		const telemetryDocs = await TelemetryModel.find({});
		expect(telemetryDocs).toHaveLength(1);
		expect(telemetryDocs[0].speed).toBeCloseTo(12.4);

		expect(broadcaster.broadcast).toHaveBeenCalledTimes(1);
		const wire = broadcaster.broadcast.mock.calls[0][0] as {
			vehicleId: string;
			lat: number;
		};
		expect(wire.vehicleId).toBe(vehicle?._id.toHexString());
		expect(wire.lat).toBeCloseTo(25.79);
	});

	it("updates an existing vehicle on subsequent telemetry instead of creating a duplicate", async () => {
		const callsign = "V-INGEST-2";
		const existing = await makeVehicle({ callsign });
		const broadcaster = makeFakeBroadcaster();
		const logger = makeFakeLogger();
		const payload = JSON.stringify({
			callsign,
			lat: 26.0,
			lon: -80.5,
			speed: 5,
			heading: 90,
			timestamp: new Date().toISOString(),
		});

		await handleTelemetry(
			Buffer.from(payload),
			callsign,
			defaultModelId,
			broadcaster as unknown as Parameters<typeof handleTelemetry>[3],
			logger as unknown as Parameters<typeof handleTelemetry>[4],
		);

		const vehicles = await VehicleModel.find({ callsign });
		expect(vehicles).toHaveLength(1);
		expect(vehicles[0]._id.toHexString()).toBe(existing._id.toHexString());
		expect(vehicles[0].lastTelemetry?.lat).toBeCloseTo(26.0);
	});

	it("logs a warning and returns without throwing on invalid JSON", async () => {
		const broadcaster = makeFakeBroadcaster();
		const logger = makeFakeLogger();
		const callsign = "V-BAD-JSON";

		await handleTelemetry(
			Buffer.from("not-json"),
			callsign,
			defaultModelId,
			broadcaster as unknown as Parameters<typeof handleTelemetry>[3],
			logger as unknown as Parameters<typeof handleTelemetry>[4],
		);

		expect(logger.warn).toHaveBeenCalledTimes(1);
		expect(broadcaster.broadcast).not.toHaveBeenCalled();
		const vehicle = await VehicleModel.findOne({ callsign });
		expect(vehicle).toBeNull();
		const telemetryDocs = await TelemetryModel.find({});
		expect(telemetryDocs).toHaveLength(0);
	});

	it("logs a warning and returns when payload fails schema validation", async () => {
		const broadcaster = makeFakeBroadcaster();
		const logger = makeFakeLogger();
		const callsign = "V-BAD-SCHEMA";
		const payload = JSON.stringify({
			callsign,
			lat: 25.79,
			lon: -80.19,
			speed: 12,
			heading: 999,
			timestamp: new Date().toISOString(),
		});

		await handleTelemetry(
			Buffer.from(payload),
			callsign,
			defaultModelId,
			broadcaster as unknown as Parameters<typeof handleTelemetry>[3],
			logger as unknown as Parameters<typeof handleTelemetry>[4],
		);

		expect(logger.warn).toHaveBeenCalledTimes(1);
		expect(broadcaster.broadcast).not.toHaveBeenCalled();
		const vehicle = await VehicleModel.findOne({ callsign });
		expect(vehicle).toBeNull();
	});
});
