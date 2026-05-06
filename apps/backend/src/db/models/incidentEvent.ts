import { INCIDENT_EVENT_KINDS } from "@roam/shared";
import mongoose from "mongoose";

// Off-chain mirror of the on-chain IncidentEvent PDA. Mongo is the canonical
// store for queries; the chain is the audit trail. `solanaTxSignature` is
// patched in async after the chain write returns — null/undefined while
// in-flight or after a chain failure (the row is still authoritative).
//
// `responderId` is null for incident-scoped events (`received`, `cleared`).
//
// The unique compound index on (incidentId, kind, responderId) mirrors the
// on-chain PDA seeds and makes `recordIncidentEvent` safely retryable: a
// duplicate insert raises E11000, which the service catches.
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
incidentEventSchema.index(
	{ incidentId: 1, kind: 1, responderId: 1 },
	{ unique: true },
);

export const IncidentEventModel = mongoose.model(
	"IncidentEvent",
	incidentEventSchema,
);
