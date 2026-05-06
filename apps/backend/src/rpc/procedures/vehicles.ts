import { ORPCError } from "@orpc/server";
import { VehicleModel } from "../../db/models/vehicle.js";
import { VehicleSpecModel } from "../../db/models/vehicleSpec.js";
import {
	activeResponderMap,
	serializeVehicle,
} from "../../db/serializers/vehicle.js";
import { os } from "../builder.js";

const DEFAULT_MODEL_SLUG = "ambulance-type-1";

export const vehiclesRouter = {
	list: os.vehicles.list.handler(async () => {
		const vehicles = await VehicleModel.find().populate("model").lean();
		const responderMap = await activeResponderMap(vehicles.map((v) => v._id));
		return vehicles.map((v) =>
			serializeVehicle(v, responderMap.get(v._id.toHexString()) ?? null),
		);
	}),

	get: os.vehicles.get.handler(async ({ input }) => {
		const vehicle = await VehicleModel.findById(input.id)
			.populate("model")
			.lean();
		if (!vehicle) {
			throw new ORPCError("NOT_FOUND", {
				message: "vehicle_not_found",
				data: { error: "vehicle_not_found" as const },
			});
		}
		const responderMap = await activeResponderMap([vehicle._id]);
		return serializeVehicle(
			vehicle,
			responderMap.get(vehicle._id.toHexString()) ?? null,
		);
	}),

	upsertByCallsign: os.vehicles.upsertByCallsign.handler(async ({ input }) => {
		const { callsign, status, modelSlug, lastTelemetry } = input;

		const spec = await VehicleSpecModel.findOne({
			slug: modelSlug ?? DEFAULT_MODEL_SLUG,
		}).lean();
		if (!spec) {
			throw new ORPCError("NOT_FOUND", {
				message: "vehicle_spec_not_found",
				data: { error: "vehicle_spec_not_found" as const },
			});
		}

		const $set: Record<string, unknown> = {
			model: spec._id,
		};
		if (status) {
			$set.status = status;
		}
		if (lastTelemetry) {
			$set.lastTelemetry = {
				lat: lastTelemetry.lat,
				lon: lastTelemetry.lon,
				speed: lastTelemetry.speed ?? 0,
				heading: lastTelemetry.heading ?? 0,
				batteryPct: lastTelemetry.batteryPct,
				timestamp: new Date(),
			};
		}

		const $setOnInsert: Record<string, unknown> = {
			createdAt: new Date(),
		};

		const vehicle = await VehicleModel.findOneAndUpdate(
			{ callsign },
			{ $set, $setOnInsert },
			{ upsert: true, returnDocument: "after" },
		);

		await vehicle.populate("model");

		const obj = vehicle.toObject();
		return {
			vehicle: serializeVehicle(obj, null),
		};
	}),
};
