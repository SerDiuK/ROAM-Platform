import { ORPCError } from "@orpc/server";
import type { Responder } from "@roam/shared";
import { Types } from "mongoose";
import { isDuplicateKeyError } from "../../db/errors.js";
import { ResponderModel } from "../../db/models/responder.js";
import { VehicleModel } from "../../db/models/vehicle.js";
import { serializeVehicle } from "../../db/serializers/vehicle.js";
import { os } from "../builder.js";

function isObjectIdHex(value: string): boolean {
	return Types.ObjectId.isValid(value) && /^[0-9a-fA-F]{24}$/.test(value);
}

export const authRouter = {
	checkin: os.auth.checkin.handler(async ({ input }) => {
		const responder = await ResponderModel.findOne({
			name: input.responderName,
		});
		if (!responder) {
			throw new ORPCError("NOT_FOUND", {
				message: "responder_not_found",
			});
		}
		if (responder.currentVehicleId) {
			throw new ORPCError("CONFLICT", {
				message: "responder_already_checked_in",
			});
		}

		if (!isObjectIdHex(input.vehicleId)) {
			throw new ORPCError("NOT_FOUND", {
				message: "vehicle_not_found",
			});
		}

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
				});
			}
			throw new ORPCError("CONFLICT", {
				message: "vehicle_not_available",
			});
		}

		try {
			await ResponderModel.updateOne(
				{ _id: responder._id, currentVehicleId: null },
				{ currentVehicleId: input.vehicleId },
			).then((res) => {
				if (res.matchedCount === 0) {
					throw new ORPCError("CONFLICT", {
						message: "responder_already_checked_in",
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
			});
		}

		return {
			vehicle: serializeVehicle(vehicleDoc.toObject(), null),
		};
	}),
};
