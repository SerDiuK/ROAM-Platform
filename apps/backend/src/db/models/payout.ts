import { PAYOUT_STATUSES } from "@roam/shared";
import mongoose from "mongoose";

const payoutSchema = new mongoose.Schema({
	_id: { type: String, required: true },
	dispatchId: { type: String, ref: "Dispatch", required: true },
	responderId: { type: String, ref: "Responder", required: true },
	recipientWalletAddress: { type: String, required: true },
	amountUsdc: { type: Number },
	amountSol: { type: Number },
	status: { type: String, enum: PAYOUT_STATUSES, required: true },
	initiatedAt: { type: Date, required: true },
	settledAt: { type: Date },
	solanaTxSignature: { type: String },
	error: { type: String },
});

payoutSchema.index({ status: 1, dispatchId: 1 });

export const PayoutModel = mongoose.model("Payout", payoutSchema);
