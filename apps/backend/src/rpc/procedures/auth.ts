import { ORPCError } from "@orpc/server";
import type { Responder } from "@roam/shared";
import { Types } from "mongoose";
import { ResponderModel } from "../../db/models/responder.js";
import { VehicleModel } from "../../db/models/vehicle.js";
import { serializeVehicle } from "../../db/serializers/vehicle.js";
import { os } from "../builder.js";

// Shifts no longer write to Solana. Checkin / checkout flip
// `Responder.currentVehicleId` and `Vehicle.status` only — the on-chain audit
// is incident-scoped (see services/incidentEvents.ts). The unique-sparse
// partial index on `Responder.currentVehicleId` is the canonical
// "1 responder per vehicle" guarantee.

function isObjectIdHex(value: string): boolean {
	return Types.ObjectId.isValid(value) && /^[0-9a-fA-F]{24}$/.test(value);
}

// MongoServerError sets `code` to 11000 on duplicate-key violations. Narrow
// through `unknown` rather than asserting `code: number` so a malformed error
// (e.g., something thrown inside a transaction wrapper) can't slip through.
function isDuplicateKeyError(err: unknown): boolean {
	if (!(err instanceof Error) || !("code" in err)) return false;
	const { code } = err as { code: unknown };
	return code === 11000;
}

export const authRouter = {
	checkin: os.auth.checkin.handler(async ({ input }) => {
		const responder = await ResponderModel.findOne({
			name: input.responderName,
		});
		if (!responder) {
			throw new ORPCError("NOT_FOUND", {
				message: "responder_not_found",
				data: { error: "responder_not_found" as const },
			});
		}
		if (responder.currentVehicleId) {
			throw new ORPCError("CONFLICT", {
				message: "responder_already_checked_in",
				data: {
					error: "responder_already_checked_in" as const,
					vehicleId: responder.currentVehicleId,
				},
			});
		}

		if (!isObjectIdHex(input.vehicleId)) {
			throw new ORPCError("NOT_FOUND", {
				message: "vehicle_not_found",
				data: { error: "vehicle_not_found" as const },
			});
		}

		// Atomic flip — fails (returns null) when status is anything but available.
		const vehicleDoc = await VehicleModel.findOneAndUpdate(
			{ _id: input.vehicleId, status: "available" },
			{ status: "in_use" },
			{ returnDocument: "after" },
		).populate("model");

		if (!vehicleDoc) {
			const exists = await VehicleModel.exists({ _id: input.vehicleId });
			if (!exists) {
				throw new ORPCError("NOT_FOUND", {
					message: "vehicle_not_found",
					data: { error: "vehicle_not_found" as const },
				});
			}
			throw new ORPCError("CONFLICT", {
				message: "vehicle_not_available",
				data: { error: "vehicle_not_available" as const },
			});
		}

		try {
			await ResponderModel.updateOne(
				{ _id: responder._id, currentVehicleId: null },
				{ currentVehicleId: input.vehicleId },
			).then((res) => {
				if (res.matchedCount === 0) {
					// Either currentVehicleId got set under us OR a separate query
					// already checked someone else into this vehicle (unique-sparse
					// would have caught a write conflict — handled below).
					throw new ORPCError("CONFLICT", {
						message: "responder_already_checked_in",
						data: { error: "responder_already_checked_in" as const },
					});
				}
			});
		} catch (err: unknown) {
			await VehicleModel.findByIdAndUpdate(input.vehicleId, {
				status: "available",
			});
			if (isDuplicateKeyError(err)) {
				throw new ORPCError("CONFLICT", {
					message: "responder_already_checked_in",
					data: { error: "responder_already_checked_in" as const },
				});
			}
			throw err;
		}

		return {
			vehicle: serializeVehicle(vehicleDoc.toObject(), responder._id),
			responder: {
				_id: responder._id,
				name: responder.name,
				role: responder.role,
			} satisfies Pick<Responder, "_id" | "name" | "role">,
		};
	}),

	checkout: os.auth.checkout.handler(async ({ input }) => {
		const responder = await ResponderModel.findOne({
			currentVehicleId: input.vehicleId,
		});
		if (!responder) {
			throw new ORPCError("CONFLICT", {
				message: "not_checked_in",
				data: { error: "not_checked_in" as const },
			});
		}

		await ResponderModel.updateOne(
			{ _id: responder._id },
			{ currentVehicleId: null },
		);

		const vehicleDoc = await VehicleModel.findByIdAndUpdate(
			input.vehicleId,
			{ status: "available" },
			{ returnDocument: "after" },
		).populate("model");

		if (!vehicleDoc) {
			throw new ORPCError("NOT_FOUND", {
				message: "vehicle_not_found",
				data: { error: "vehicle_not_found" as const },
			});
		}

		return {
			vehicle: serializeVehicle(vehicleDoc.toObject(), null),
		};
	}),
};
