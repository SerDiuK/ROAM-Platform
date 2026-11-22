import { ORPCError } from "@orpc/server";
import type { Vehicle } from "@roam/shared";
import type { Types } from "mongoose";
import { ResponderModel } from "../models/responder.js";

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
	// populate() swaps the FK for the VehicleSpec doc at runtime, which TS can't see.
	const model = v.model as { _id: Types.ObjectId } & Record<string, unknown>;
	return {
		...v,
		_id: v._id.toHexString(),
		model: { ...model, _id: model._id.toHexString() },
		currentResponderId,
	} as unknown as Vehicle;
}
