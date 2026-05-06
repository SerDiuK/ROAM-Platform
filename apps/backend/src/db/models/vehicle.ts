import { VEHICLE_STATUSES } from "@roam/shared";
import mongoose from "mongoose";

// GeoJSON Point sub-subdoc populated automatically from `lat`/`lon` on save
// and update. Coordinates are `[lon, lat]` per the GeoJSON spec — easy to flip
// by accident. The 2dsphere index below uses this field.
const locationSchema = new mongoose.Schema(
	{
		type: { type: String, enum: ["Point"], default: "Point", required: true },
		coordinates: { type: [Number], required: true },
	},
	{ _id: false },
);

// Embedded snapshot of the vehicle's most recent fix. No vehicleId field —
// the parent document's _id already identifies it. The standalone
// TelemetryModel collection has its own vehicleId FK for time-series queries.
const TelemetrySubSchema = new mongoose.Schema(
	{
		lat: { type: Number, required: true },
		lon: { type: Number, required: true },
		speed: { type: Number, required: true },
		heading: { type: Number, required: true },
		batteryPct: { type: Number },
		timestamp: { type: Date, required: true },
		location: { type: locationSchema, default: undefined },
	},
	{ _id: false },
);

// `_id` is auto-assigned ObjectId. The 24-char hex serialization is also the
// Solana session PDA seed (well under the 32-byte seed limit).
// `model` is an ObjectId FK to a VehicleSpec doc, populated before serialization.
const vehicleSchema = new mongoose.Schema({
	callsign: { type: String, required: true, unique: true },
	model: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "VehicleSpec",
		required: true,
	},
	status: {
		type: String,
		enum: VEHICLE_STATUSES,
		default: "available",
	},
	assignedResponderIds: { type: [String], default: undefined },
	lastTelemetry: { type: TelemetrySubSchema, default: undefined },
	createdAt: { type: Date, default: Date.now },
});

vehicleSchema.index({ status: 1 });
vehicleSchema.index({ "lastTelemetry.location": "2dsphere" });

// Shape we read out of the update payload to derive the GeoJSON Point. Cast
// here is unavoidable: getUpdate() returns a wide UpdateQuery union, and the
// fields we touch are not represented in the schema's TS surface.
type LastTelemetryUpdate = {
	lat?: number;
	lon?: number;
	location?: { type: "Point"; coordinates: [number, number] };
};
type VehicleUpdate = {
	$set?: { lastTelemetry?: LastTelemetryUpdate };
	lastTelemetry?: LastTelemetryUpdate;
};

function deriveLocationOnTarget(target: LastTelemetryUpdate | undefined): void {
	if (!target) return;
	if (typeof target.lat !== "number" || typeof target.lon !== "number") return;
	target.location = {
		type: "Point",
		coordinates: [target.lon, target.lat],
	};
}

vehicleSchema.pre("save", function () {
	deriveLocationOnTarget(this.lastTelemetry as LastTelemetryUpdate | undefined);
});

vehicleSchema.pre("findOneAndUpdate", function () {
	const raw = this.getUpdate();
	if (!raw || Array.isArray(raw)) return;
	const update = raw as VehicleUpdate;
	deriveLocationOnTarget(update.$set?.lastTelemetry);
	deriveLocationOnTarget(update.lastTelemetry);
});

export const VehicleModel = mongoose.model("Vehicle", vehicleSchema);
