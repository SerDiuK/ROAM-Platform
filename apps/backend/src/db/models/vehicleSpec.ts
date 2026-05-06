import type { VehicleSpec } from "@roam/shared";
import mongoose from "mongoose";

const vehicleSpecSchema = new mongoose.Schema<VehicleSpec>({
	slug: { type: String, required: true, unique: true },
	manufacturer: { type: String, required: true },
	name: { type: String, required: true },
	imageUrl: { type: String, required: true },
	description: { type: String },
	category: { type: String },
	topSpeedKph: { type: Number },
	rangeKm: { type: Number },
	payloadKg: { type: Number },
	weightKg: { type: Number },
	drivetrain: { type: String },
	batteryKwh: { type: Number },
	productUrl: { type: String },
});

export const VehicleSpecModel = mongoose.model<VehicleSpec>(
	"VehicleSpec",
	vehicleSpecSchema,
);
