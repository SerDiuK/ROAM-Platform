import { randomUUID } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import { type Mock, vi } from "vitest";
import type { Transcriber } from "../src/agent/transcribe.js";
import type { Config } from "../src/config.js";
import { ResponderModel } from "../src/db/models/responder.js";
import { VehicleModel } from "../src/db/models/vehicle.js";
import { VehicleSpecModel } from "../src/db/models/vehicleSpec.js";
import type { ExpoPushClient } from "../src/push/expo.js";
import type { RpcContext } from "../src/rpc/context.js";
import type { TelemetryBroadcaster } from "../src/ws/telemetryBroadcaster.js";

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

export function makeFakeTelemetryBroadcaster(): TelemetryBroadcaster & {
	broadcast: Mock;
} {
	return { addClient: vi.fn(), removeClient: vi.fn(), broadcast: vi.fn() };
}

export function makeFakeTranscriber(
	transcript = "fake transcript",
): Transcriber & {
	transcribeAudioFile: Mock<Transcriber["transcribeAudioFile"]>;
} {
	return {
		transcribeAudioFile: vi.fn<Transcriber["transcribeAudioFile"]>(
			async () => ({ transcript, confidence: 0.95, utterances: [] }),
		),
		transcribeAudioStream: vi.fn<Transcriber["transcribeAudioStream"]>(
			async () => transcript,
		),
	};
}

type FakeLogger = FastifyBaseLogger & {
	info: Mock;
	warn: Mock;
	error: Mock;
	debug: Mock;
};

export function makeFakeLogger(): FakeLogger {
	const logger: FakeLogger = {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
		trace: vi.fn(),
		fatal: vi.fn(),
		silent: vi.fn(),
		child: () => logger,
		level: "silent",
	};
	return logger;
}

export function makeFakePushClient(): ExpoPushClient & {
	sendPushToResponders: Mock;
} {
	return {
		sendPushToResponders: vi.fn(async () => ({
			tickets: [],
			delivered: 0,
			skipped: 0,
		})),
	};
}

export function makeRpcContext(
	config: Partial<Config>,
	overrides: Partial<Omit<RpcContext, "config">> = {},
): RpcContext {
	return {
		// Specs pass only the config keys the procedure under test reads.
		config: config as Config,
		transcriber: makeFakeTranscriber(),
		// No procedure spec reaches the Anthropic client: incidents.spec mocks the agent.
		anthropic: {} as RpcContext["anthropic"],
		pushClient: makeFakePushClient(),
		log: makeFakeLogger(),
		user: null,
		...overrides,
	};
}
