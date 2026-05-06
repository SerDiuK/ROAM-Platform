import { describe, expect, it } from "vitest";
import {
	TelemetryIngestSchema,
	TelemetrySchema,
	TelemetrySnapshotSchema,
} from "./telemetry";

describe("TelemetryIngestSchema", () => {
	const valid = {
		callsign: "V-001",
		lat: 25.79,
		lon: -80.19,
		speed: 12.4,
		heading: 180,
		batteryPct: 87,
		timestamp: "2026-05-04T10:00:00Z",
	};

	it("accepts a valid ingest payload and coerces timestamp to Date", () => {
		const result = TelemetryIngestSchema.parse(valid);
		expect(result.callsign).toBe("V-001");
		expect(result.timestamp).toBeInstanceOf(Date);
	});

	it("rejects when callsign is missing", () => {
		const { callsign: _omit, ...partial } = valid;
		expect(() => TelemetryIngestSchema.parse(partial)).toThrow();
	});

	it("rejects when heading is out of range (negative)", () => {
		expect(() =>
			TelemetryIngestSchema.parse({ ...valid, heading: -1 }),
		).toThrow();
	});

	it("rejects when heading is out of range (over 360)", () => {
		expect(() =>
			TelemetryIngestSchema.parse({ ...valid, heading: 361 }),
		).toThrow();
	});

	it("rejects when batteryPct is over 100", () => {
		expect(() =>
			TelemetryIngestSchema.parse({ ...valid, batteryPct: 150 }),
		).toThrow();
	});

	it("treats batteryPct as optional", () => {
		const { batteryPct: _omit, ...partial } = valid;
		const result = TelemetryIngestSchema.parse(partial);
		expect(result.batteryPct).toBeUndefined();
	});
});

describe("TelemetrySchema", () => {
	it("requires vehicleId in the wire shape", () => {
		const ingest = {
			lat: 0,
			lon: 0,
			speed: 0,
			heading: 0,
			timestamp: new Date(),
		};
		expect(() => TelemetrySchema.parse(ingest)).toThrow();
	});

	it("round-trips the wire shape", () => {
		const wire = {
			vehicleId: "abc123",
			lat: 25.79,
			lon: -80.19,
			speed: 12.4,
			heading: 180,
			timestamp: "2026-05-04T10:00:00Z",
		};
		const result = TelemetrySchema.parse(wire);
		expect(result.vehicleId).toBe("abc123");
		expect(result.timestamp).toBeInstanceOf(Date);
	});
});

describe("TelemetrySnapshotSchema", () => {
	it("does not include vehicleId (snapshot lives on Vehicle._id)", () => {
		const snapshot = {
			lat: 0,
			lon: 0,
			speed: 0,
			heading: 0,
			timestamp: new Date(),
		};
		const result = TelemetrySnapshotSchema.parse(snapshot);
		expect(result).not.toHaveProperty("vehicleId");
	});
});

