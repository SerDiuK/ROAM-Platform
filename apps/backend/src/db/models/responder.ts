import {
	RESPONDER_AVAILABILITIES,
	RESPONDER_CAPABILITIES,
	type Responder,
} from "@roam/shared";
import mongoose from "mongoose";

type ResponderDoc = Responder & { pushTokens?: string[] };

const responderSchema = new mongoose.Schema<ResponderDoc>({
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

export const ResponderModel = mongoose.model<ResponderDoc>(
	"Responder",
	responderSchema,
);
