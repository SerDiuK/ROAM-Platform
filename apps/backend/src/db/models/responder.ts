import { RESPONDER_AVAILABILITIES, RESPONDER_CAPABILITIES } from "@roam/shared";
import mongoose from "mongoose";

// `_id` is a UUID-with-dashes string assigned at enrol time (see
// rpc/procedures/responders.ts). The schema must override `_id` to String;
// otherwise mongoose treats it as ObjectId and casts fail at runtime.
//
// `encryptedWalletSecret` holds the AES-256-GCM ciphertext of the responder's
// embedded Solana keypair. `select: false` keeps it out of every default query
// — it is read only inside the wallet provider when a transfer needs signing.
//
// `pinHash` is a bcrypt hash of the responder's PIN. Same `select: false` rule
// — only the auth.signIn procedure ever needs to read it.
//
// `currentVehicleId` (AD-22) is the persistent responder↔vehicle pairing,
// replacing the off-chain Session collection. The unique-sparse partial
// index enforces "1 responder per vehicle" — the sparse partialFilter is on
// the string type, not "exists", so a missing/null currentVehicleId is
// excluded from the uniqueness check.
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
	encryptedWalletSecret: { type: String, select: false },
	pinHash: { type: String, select: false },
	pushTokens: { type: [String], default: undefined },
	capabilities: {
		type: [{ type: String, enum: RESPONDER_CAPABILITIES }],
		default: undefined,
	},
	currentVehicleId: { type: String, default: null },
});

responderSchema.index({ capabilities: 1 }, { sparse: true });
responderSchema.index(
	{ currentVehicleId: 1 },
	{
		unique: true,
		partialFilterExpression: { currentVehicleId: { $type: "string" } },
	},
);

export const ResponderModel = mongoose.model("Responder", responderSchema);
