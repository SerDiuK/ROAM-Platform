import mongoose from "mongoose";

const telemetrySchema = new mongoose.Schema({
	vehicleId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "Vehicle",
		required: true,
	},
	lat: { type: Number, required: true },
	lon: { type: Number, required: true },
	speed: { type: Number, required: true },
	heading: { type: Number, required: true },
	batteryPct: { type: Number },
	timestamp: { type: Date, required: true },
});

telemetrySchema.index({ vehicleId: 1, timestamp: -1 });
telemetrySchema.index({ timestamp: 1 }, { expireAfterSeconds: 604800 });

export const TelemetryModel = mongoose.model("Telemetry", telemetrySchema);
