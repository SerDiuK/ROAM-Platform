import { randomUUID } from "node:crypto";
import { vi } from "vitest";
import { ResponderModel } from "../src/db/models/responder.js";
import { VehicleModel } from "../src/db/models/vehicle.js";
import { VehicleSpecModel } from "../src/db/models/vehicleSpec.js";

export async function getDefaultSpec() {
	const existing = await VehicleSpecModel.findOne({ slug: "ambulance-type-1" });
	if (existing) return existing;
	return new VehicleSpecModel({
		slug: "ambulance-type-1",
		manufacturer: "Wheeled Coach",
		name: "Type I Ambulance",
		imageUrl: "https://example.com/ambulance.png",
	}).save();
}

export async function makeResponder(
	overrides: Partial<{
		name: string;
		role: "responder" | "dispatcher";
		availability: "available" | "occupied" | "off_duty" | "unavailable";
		currentVehicleId: string | null;
	}> = {},
) {
	return new ResponderModel({
		_id: randomUUID(),
		name: overrides.name ?? `RSP-${randomUUID().slice(0, 6)}`,
		role: overrides.role ?? "responder",
		availability: overrides.availability ?? "available",
		currentVehicleId: overrides.currentVehicleId ?? null,
	}).save();
}

export async function makeVehicle(
	overrides: Partial<{
		callsign: string;
		status: "available" | "in_use" | "locked" | "offline";
		lastTelemetry: {
			lat: number;
			lon: number;
			speed: number;
			heading: number;
			timestamp: Date;
		};
	}> = {},
) {
	const spec = await getDefaultSpec();
	return new VehicleModel({
		callsign: overrides.callsign ?? `V-${randomUUID().slice(0, 6)}`,
		model: spec._id,
		status: overrides.status ?? "available",
		lastTelemetry: overrides.lastTelemetry,
	}).save();
}

export function makeFakeBroadcaster(): {
	addClient: ReturnType<typeof vi.fn>;
	removeClient: ReturnType<typeof vi.fn>;
	broadcast: ReturnType<typeof vi.fn>;
} {
	return { addClient: vi.fn(), removeClient: vi.fn(), broadcast: vi.fn() };
}

export function makeFakeTranscriber(
	transcript = "fake transcript",
): {
	transcribeAudioFile: ReturnType<typeof vi.fn>;
	transcribeAudioStream: ReturnType<typeof vi.fn>;
} {
	return {
		transcribeAudioFile: vi.fn(async () => ({
			transcript,
			confidence: 0.95,
			utterances: [],
		})),
		transcribeAudioStream: vi.fn(async () => transcript),
	};
}

export function makeFakeLogger(): {
	info: ReturnType<typeof vi.fn>;
	warn: ReturnType<typeof vi.fn>;
	error: ReturnType<typeof vi.fn>;
	debug: ReturnType<typeof vi.fn>;
	trace: ReturnType<typeof vi.fn>;
	fatal: ReturnType<typeof vi.fn>;
	child: () => ReturnType<typeof makeFakeLogger>;
	level: string;
	silent: () => void;
} {
	const logger = {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
		trace: vi.fn(),
		fatal: vi.fn(),
		child: () => logger,
		level: "silent",
		silent: () => {},
	};
	return logger;
}
