import { VEHICLE_STATUSES } from "@roam/shared";
import mongoose from "mongoose";

// GeoJSON order: coordinates are [lon, lat], easy to flip by accident.
const locationSchema = new mongoose.Schema(
	{
		type: { type: String, enum: ["Point"], default: "Point", required: true },
		coordinates: { type: [Number], required: true },
	},
	{ _id: false },
);

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

// Cast targets: getUpdate() is a wide UpdateQuery union that doesn't type these fields.
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
