import {
	INCIDENT_STATUSES,
	INCIDENT_URGENCIES,
	RESPONDER_CAPABILITIES,
} from "@roam/shared";
import mongoose from "mongoose";

const classificationLocationSchema = new mongoose.Schema(
	{
		lat: { type: Number, required: true },
		lon: { type: Number, required: true },
	},
	{ _id: false },
);

const classificationSchema = new mongoose.Schema(
	{
		incidentType: { type: String, required: true },
		urgency: { type: Number, enum: INCIDENT_URGENCIES, required: true },
		location: { type: classificationLocationSchema, default: undefined },
		locationDescription: { type: String },
		requiredCapabilities: {
			type: [{ type: String, enum: RESPONDER_CAPABILITIES }],
			required: true,
			default: [],
		},
	},
	{ _id: false },
);

const assignedSchema = new mongoose.Schema(
	{
		vehicles: { type: [String], required: true, default: [] },
		responders: { type: [String], required: true, default: [] },
	},
	{ _id: false },
);

// `_id` is a string set explicitly at create time (matches IncidentSchema._id).
// `createdAt` / `updatedAt` are managed by Mongoose timestamps so the round-trip
// through Zod (which requires both as dates) succeeds without manual setup.
const incidentSchema = new mongoose.Schema(
	{
		_id: { type: String, required: true },
		callStartedAt: { type: Date, required: true },
		transcript: { type: String, required: true },
		transcriptHash: { type: String, required: true },
		classification: { type: classificationSchema, default: undefined },
		status: { type: String, enum: INCIDENT_STATUSES, required: true },
		assigned: {
			type: assignedSchema,
			required: true,
			default: () => ({ vehicles: [], responders: [] }),
		},
		dispatchedAt: { type: Date },
		clearedAt: { type: Date },
	},
	{ timestamps: true },
);

incidentSchema.index({ status: 1, callStartedAt: -1 });

export const IncidentModel = mongoose.model("Incident", incidentSchema);
