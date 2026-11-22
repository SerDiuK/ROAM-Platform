import { RESPONDER_AVAILABILITIES, RESPONDER_CAPABILITIES } from "@roam/shared";
import mongoose from "mongoose";

const responderSchema = new mongoose.Schema({
	_id: { type: String, required: true },
	name: { type: String, required: true, unique: true },
	displayName: { type: String },
	role: { type: String, enum: ["responder", "dispatcher"], required: true },
	availability: {
		type: String,
		enum: RESPONDER_AVAILABILITIES,
		default: "available",
		required: true,
	},
	walletAddress: { type: String, index: true },
	pushTokens: { type: [String], default: undefined },
	capabilities: {
		type: [{ type: String, enum: RESPONDER_CAPABILITIES }],
		default: undefined,
	},
	currentVehicleId: { type: String, default: null },
});

responderSchema.index({ capabilities: 1 }, { sparse: true });
// `$type`, not `$exists`: unpaired responders store null, which `$exists` would index.
responderSchema.index(
	{ currentVehicleId: 1 },
	{
		unique: true,
		partialFilterExpression: { currentVehicleId: { $type: "string" } },
	},
);

export const ResponderModel = mongoose.model("Responder", responderSchema);
