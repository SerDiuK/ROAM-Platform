import mongoose from "mongoose";

const briefingSchema = new mongoose.Schema({
	_id: { type: String, required: true },
	incidentId: { type: String, ref: "Incident", required: true },
	generatedAt: { type: Date, required: true },
	generatedByModel: { type: String, required: true },
	summary: { type: String, required: true },
	recommendedVehicleIds: { type: [String], required: true, default: [] },
	recommendedResponderIds: { type: [String], required: true, default: [] },
	briefingHash: { type: String, required: true },
});

briefingSchema.index({ incidentId: 1 });

export const BriefingModel = mongoose.model("Briefing", briefingSchema);
