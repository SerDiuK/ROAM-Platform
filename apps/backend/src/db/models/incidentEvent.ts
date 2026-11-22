import { INCIDENT_EVENT_KINDS } from "@roam/shared";
import mongoose from "mongoose";

const payloadSchema = new mongoose.Schema(
	{
		briefingId: { type: String },
		dispatchId: { type: String },
		declineReason: { type: String },
		vehicleId: { type: String },
		distanceM: { type: Number },
	},
	{ _id: false, minimize: true },
);

const incidentEventSchema = new mongoose.Schema({
	incidentId: { type: String, required: true },
	kind: { type: String, enum: INCIDENT_EVENT_KINDS, required: true },
	responderId: { type: String, default: null },
	occurredAt: { type: Date, required: true },
	payload: { type: payloadSchema, default: undefined },
	solanaTxSignature: { type: String },
});

incidentEventSchema.index({ incidentId: 1, occurredAt: 1 });
incidentEventSchema.index({ responderId: 1, occurredAt: -1 });
// Mirrors the on-chain PDA seeds; recordIncidentEvent treats its E11000 as already recorded.
incidentEventSchema.index(
	{ incidentId: 1, kind: 1, responderId: 1 },
	{ unique: true },
);

export const IncidentEventModel = mongoose.model(
	"IncidentEvent",
	incidentEventSchema,
);
