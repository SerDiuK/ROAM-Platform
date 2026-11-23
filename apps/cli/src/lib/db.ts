import {
	INCIDENT_STATUSES,
	INCIDENT_URGENCIES,
	RESPONDER_CAPABILITIES,
} from "@roam/shared";
import mongoose from "mongoose";
import { config } from "../config.js";

// Keep field names in sync with apps/backend/src/db/models: both apps share these collections.

const responderSchema = new mongoose.Schema(
	{
		_id: { type: String, required: true },
		name: { type: String, required: true },
		role: { type: String, required: true },
		availability: { type: String, required: true },
		walletAddress: { type: String },
	},
	{ collection: "responders", strict: false },
);

const vehicleSchema = new mongoose.Schema(
	{
		callsign: { type: String, required: true },
	},
	{ collection: "vehicles", strict: false },
);

const incidentClassificationSchema = new mongoose.Schema(
	{
		incidentType: { type: String, required: true },
		urgency: { type: Number, enum: INCIDENT_URGENCIES, required: true },
		locationDescription: { type: String },
		requiredCapabilities: {
			type: [{ type: String, enum: RESPONDER_CAPABILITIES }],
			required: true,
			default: [],
		},
	},
	{ _id: false },
);

const incidentSchema = new mongoose.Schema(
	{
		_id: { type: String, required: true },
		callStartedAt: { type: Date, required: true },
		transcript: { type: String, required: true },
		transcriptHash: { type: String, required: true },
		classification: { type: incidentClassificationSchema, default: undefined },
		status: { type: String, enum: INCIDENT_STATUSES, required: true },
		assigned: {
			type: new mongoose.Schema(
				{
					vehicles: { type: [String], required: true, default: [] },
					responders: { type: [String], required: true, default: [] },
				},
				{ _id: false },
			),
			required: true,
			default: () => ({ vehicles: [], responders: [] }),
		},
	},
	{ timestamps: true, collection: "incidents" },
);

const briefingSchema = new mongoose.Schema(
	{
		_id: { type: String, required: true },
		incidentId: { type: String, required: true },
		generatedAt: { type: Date, required: true },
		generatedByModel: { type: String, required: true },
		summary: { type: String, required: true },
		recommendedVehicleIds: { type: [String], required: true, default: [] },
		recommendedResponderIds: { type: [String], required: true, default: [] },
		briefingHash: { type: String, required: true },
	},
	{ collection: "briefings" },
);

export const ResponderModel =
	mongoose.models.CliResponder ??
	mongoose.model("CliResponder", responderSchema);
export const VehicleModel =
	mongoose.models.CliVehicle ?? mongoose.model("CliVehicle", vehicleSchema);
export const IncidentModel =
	mongoose.models.CliIncident ?? mongoose.model("CliIncident", incidentSchema);
export const BriefingModel =
	mongoose.models.CliBriefing ?? mongoose.model("CliBriefing", briefingSchema);

export async function connect(): Promise<void> {
	if (mongoose.connection.readyState === 1) return;
	await mongoose.connect(config.MONGODB_URL);
}

export async function disconnect(): Promise<void> {
	if (mongoose.connection.readyState === 0) return;
	await mongoose.disconnect();
}
