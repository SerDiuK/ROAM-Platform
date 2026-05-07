import type { VehicleSpec } from "@roam/shared";
import type { MinimalLogger } from "./connection.js";
import { VehicleSpecModel } from "./models/vehicleSpec.js";

type VehicleSpecSeed = Omit<VehicleSpec, "_id">;

const VEHICLE_SPECS: VehicleSpecSeed[] = [
	{
		slug: "ambulance-type-1",
		manufacturer: "Wheeled Coach",
		name: "Type I Ambulance",
		imageUrl: "https://i.ibb.co/4BHjLTk/vehicle-ambulance-private.png",
		description:
			"Type I medic transport — heavy-duty truck chassis with a modular patient compartment, ALS-capable for advanced life support and primary 911 medical response.",
		category: "ambulance",
		topSpeedKph: 145,
		rangeKm: 700,
		payloadKg: 1500,
		weightKg: 5400,
		drivetrain: "diesel 4×2",
		batteryKwh: 0,
		productUrl: "https://wheeledcoach.com/type-i-ambulances/",
	},
];

export async function seedVehicleSpecs(logger: MinimalLogger): Promise<void> {
	for (const spec of VEHICLE_SPECS) {
		await VehicleSpecModel.findOneAndUpdate(
			{ slug: spec.slug },
			{ $set: spec },
			{ upsert: true },
		);
	}
	logger.info(`Seeded ${VEHICLE_SPECS.length} vehicle specs`);
}
