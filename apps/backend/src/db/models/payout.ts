import mongoose from "mongoose";

const payoutSchema = new mongoose.Schema({
	_id: { type: String, required: true },
	dispatchId: { type: String, ref: "Dispatch", required: true },
	recipientWalletAddress: { type: String, required: true },
	amountSol: { type: Number, required: true },
	settledAt: { type: Date, required: true },
	solanaTxSignature: { type: String, required: true },
});

payoutSchema.index({ dispatchId: 1 }, { unique: true });

export const PayoutModel = mongoose.model("Payout", payoutSchema);
