import { PAYOUT_STATUSES } from "@roam/shared";
import mongoose from "mongoose";

// `_id` is a string set explicitly at create time. The on-chain proof is the
// SPL transfer tx itself (`solanaTxSignature`); no separate program log is
// emitted. `error` captures the failure reason when status === "failed".
const payoutSchema = new mongoose.Schema({
	_id: { type: String, required: true },
	dispatchId: { type: String, ref: "Dispatch", required: true },
	responderId: { type: String, ref: "Responder", required: true },
	recipientWalletAddress: { type: String, required: true },
	amountUsdc: { type: Number, required: true },
	status: { type: String, enum: PAYOUT_STATUSES, required: true },
	initiatedAt: { type: Date, required: true },
	settledAt: { type: Date },
	solanaTxSignature: { type: String },
	error: { type: String },
});

payoutSchema.index({ status: 1, dispatchId: 1 });

export const PayoutModel = mongoose.model("Payout", payoutSchema);
