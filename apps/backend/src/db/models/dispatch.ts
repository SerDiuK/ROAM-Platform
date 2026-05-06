import { DISPATCH_DECISION_MAKERS, DISPATCH_STATUSES } from "@roam/shared";
import mongoose from "mongoose";

// `_id` is a string set explicitly at create time. `decidedBy` is the
// dispatcher's responderId for human decisions; absent for ai-auto. `expiresAt`
// drives the dispatch reaper that flips status `pending` → `expired`.
const dispatchSchema = new mongoose.Schema({
	_id: { type: String, required: true },
	incidentId: { type: String, ref: "Incident", required: true },
	briefingId: { type: String, ref: "Briefing", required: true },
	decisionMaker: {
		type: String,
		enum: DISPATCH_DECISION_MAKERS,
		required: true,
	},
	decidedBy: { type: String },
	decidedAt: { type: Date, required: true },
	assignedVehicleIds: { type: [String], required: true, default: [] },
	assignedResponderIds: { type: [String], required: true, default: [] },
	payoutUsdc: { type: Number, required: true },
	requiredAccepts: { type: Number, required: true, min: 1 },
	status: { type: String, enum: DISPATCH_STATUSES, required: true },
	claimedByResponderIds: { type: [String], required: true, default: [] },
	expiresAt: { type: Date, required: true },
});

dispatchSchema.index({ status: 1, expiresAt: 1 });

export const DispatchModel = mongoose.model("Dispatch", dispatchSchema);
