import { DISPATCH_DECISIONS } from "@roam/shared";
import mongoose from "mongoose";

// `_id` is a string set explicitly at create time. The unique compound index
// on (dispatchId, responderId) is what enforces the first-to-claim race —
// duplicate inserts fail with MongoServerError code 11000.
//
// `solanaTxSignature` is the chain tx mobile submitted before calling
// commitSignedResponse — sparse-unique so two responses can't claim the same
// signature. `attestorPubkey` is the Seeker pubkey that signed it; indexed for
// the dashboard's "all responses by attestor" lookup.
const dispatchResponseSchema = new mongoose.Schema({
	_id: { type: String, required: true },
	dispatchId: { type: String, ref: "Dispatch", required: true },
	responderId: { type: String, ref: "Responder", required: true },
	decision: { type: String, enum: DISPATCH_DECISIONS, required: true },
	declineReason: { type: String },
	respondedAt: { type: Date, required: true },
	solanaTxSignature: { type: String },
	attestorPubkey: { type: String, index: true },
});

dispatchResponseSchema.index(
	{ dispatchId: 1, responderId: 1 },
	{ unique: true },
);
dispatchResponseSchema.index(
	{ solanaTxSignature: 1 },
	{
		unique: true,
		partialFilterExpression: { solanaTxSignature: { $type: "string" } },
	},
);

export const DispatchResponseModel = mongoose.model(
	"DispatchResponse",
	dispatchResponseSchema,
);
