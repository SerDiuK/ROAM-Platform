import { type Telemetry, TelemetryIngestSchema } from "@roam/shared";
import type { Aedes } from "aedes";
import type { FastifyBaseLogger } from "fastify";
import type { Types } from "mongoose";
import { TelemetryModel } from "../db/models/telemetry.js";
import { VehicleModel } from "../db/models/vehicle.js";
import { VehicleSpecModel } from "../db/models/vehicleSpec.js";
import type { TelemetryBroadcaster } from "../ws/telemetryBroadcaster.js";

const TELEMETRY_TOPIC_RE = /^vehicles\/([^/]+)\/telemetry$/;
const DEFAULT_MODEL_SLUG = "ambulance-type-1";

export async function registerMqttHandlers(
	aedes: Aedes,
	broadcaster: TelemetryBroadcaster,
	logger: FastifyBaseLogger,
): Promise<void> {
	const defaultSpec = await VehicleSpecModel.findOne({
		slug: DEFAULT_MODEL_SLUG,
	}).lean();
	if (!defaultSpec) {
		throw new Error(
			`Default VehicleSpec '${DEFAULT_MODEL_SLUG}' not found — seed step did not run`,
		);
	}
	const defaultModelId = defaultSpec._id;

	aedes.on("publish", (packet, client) => {
		if (!client) return;

		const match = TELEMETRY_TOPIC_RE.exec(packet.topic);
		if (!match) return;

		handleTelemetry(
			packet.payload,
			match[1],
			defaultModelId,
			broadcaster,
			logger,
		).catch((err: unknown) => {
			logger.error(err, "Unhandled error in telemetry handler");
		});
	});
}

export async function handleTelemetry(
	payload: Buffer | string,
	callsign: string,
	defaultModelId: Types.ObjectId,
	broadcaster: TelemetryBroadcaster,
	logger: FastifyBaseLogger,
): Promise<void> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(
			typeof payload === "string" ? payload : payload.toString(),
		);
	} catch {
		logger.warn({ callsign }, "Invalid JSON in telemetry message");
		return;
	}

	const result = TelemetryIngestSchema.safeParse(parsed);
	if (!result.success) {
		logger.warn(
			{ callsign, errors: result.error.format() },
			"Invalid telemetry payload",
		);
		return;
	}

	const ingest = result.data;

	const snapshot = {
		lat: ingest.lat,
		lon: ingest.lon,
		speed: ingest.speed,
		heading: ingest.heading,
		batteryPct: ingest.batteryPct,
		timestamp: ingest.timestamp,
	};

	const vehicle = await VehicleModel.findOneAndUpdate(
		{ callsign },
		{
			$set: { lastTelemetry: snapshot },
			$setOnInsert: {
				callsign,
				model: defaultModelId,
				createdAt: new Date(),
			},
		},
		{ upsert: true, returnDocument: "after" },
	);

	const vehicleObjectId = vehicle._id;
	const vehicleIdHex = vehicleObjectId.toHexString();

	await TelemetryModel.create({
		vehicleId: vehicleObjectId,
		...snapshot,
	});

	const wireTelemetry: Telemetry = {
		vehicleId: vehicleIdHex,
		...snapshot,
	};
	broadcaster.broadcast(wireTelemetry);

	logger.debug({ callsign, vehicleId: vehicleIdHex }, "Telemetry processed");
}
