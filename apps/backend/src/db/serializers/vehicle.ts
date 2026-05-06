import { ORPCError } from "@orpc/server";
import type { Vehicle } from "@roam/shared";
import type { Types } from "mongoose";
import { ResponderModel } from "../models/responder.js";

// Reverse lookup: Vehicle._id → Responder._id, joined off
// Responder.currentVehicleId. The "1 responder per vehicle" invariant is
// guarded by a unique-sparse partial index on Responder.currentVehicleId, so
// the map values are unique by construction.
export async function activeResponderMap(
	vehicleIds: Types.ObjectId[],
): Promise<Map<string, string>> {
	if (vehicleIds.length === 0) return new Map();
	const hexIds = vehicleIds.map((id) => id.toHexString());
	const responders = await ResponderModel.find({
		currentVehicleId: { $in: hexIds },
	})
		.select({ _id: 1, currentVehicleId: 1 })
		.lean();
	return new Map(
		responders.flatMap((r) =>
			r.currentVehicleId ? [[r.currentVehicleId, r._id]] : [],
		),
	);
}

// Mongoose stores `model` as an ObjectId FK; .populate("model") swaps it for
// the VehicleSpec doc at runtime. TS can't see that, so we cast the results.
// `.lean()` leaves nested ObjectIds as ObjectId instances — VehicleSpec._id
// has to be hex-stringified explicitly or Zod output validation rejects it.
export function serializeVehicle(
	v: { _id: Types.ObjectId; model: unknown; callsign?: string } & Record<
		string,
		unknown
	>,
	currentResponderId: string | null,
): Vehicle {
	if (!v.model) {
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			message: `Vehicle ${v.callsign ?? v._id.toHexString()} references a missing VehicleSpec — restart backend to re-seed specs`,
		});
	}
	const model = v.model as { _id: Types.ObjectId } & Record<string, unknown>;
	return {
		...v,
		_id: v._id.toHexString(),
		model: { ...model, _id: model._id.toHexString() },
		currentResponderId,
	} as unknown as Vehicle;
}
