import { randomUUID } from "node:crypto";
import { DEMO_FLEET } from "@roam/shared";
import mongoose from "mongoose";
import { parseConfig } from "../src/config.js";
import { connectDb } from "../src/db/connection.js";
import { ResponderModel } from "../src/db/models/responder.js";
import { VehicleModel } from "../src/db/models/vehicle.js";
import { VehicleSpecModel } from "../src/db/models/vehicleSpec.js";
import { seedVehicleSpecs } from "../src/db/seed.js";
import { createWalletProvider } from "../src/wallet/index.js";

const FALLBACK_MODEL_SLUG = "ambulance-type-1";

async function main(): Promise<void> {
	const config = parseConfig();
	await connectDb(config.MONGODB_URL, console);

	// Repeats the backend's boot-time seed so a fresh DB works without the server.
	await seedVehicleSpecs(console);

	const wallet = createWalletProvider(config);

	for (const vehicle of DEMO_FLEET) {
		const slug = vehicle.modelSlug ?? FALLBACK_MODEL_SLUG;
		const spec = await VehicleSpecModel.findOne({ slug }).lean();
		if (!spec) {
			throw new Error(
				`VehicleSpec '${slug}' not seeded — required by ${vehicle.callsign}`,
			);
		}

		const existing = await ResponderModel.findOne({
			name: vehicle.responderName,
		});
		const responder =
			existing ??
			(await new ResponderModel({
				_id: randomUUID(),
				name: vehicle.responderName,
				role: "responder",
				availability: "available",
			}).save());

		await ResponderModel.findByIdAndUpdate(responder._id, {
			role: "responder",
			availability: "available",
			capabilities: ["medic"],
		});

		const $set: Record<string, unknown> = {
			model: spec._id,
			assignedResponderIds: [responder._id],
		};
		if (vehicle.initialStatus) {
			$set.status = vehicle.initialStatus;
		}
		if (vehicle.seedTelemetry) {
			$set.lastTelemetry = {
				lat: vehicle.seedTelemetry.lat,
				lon: vehicle.seedTelemetry.lon,
				speed: 0,
				heading: 0,
				batteryPct: vehicle.batteryPct ?? 0,
				timestamp: new Date(),
			};
		}

		const v = await VehicleModel.findOneAndUpdate(
			{ callsign: vehicle.callsign },
			{ $set, $setOnInsert: { createdAt: new Date() } },
			{ upsert: true, returnDocument: "after" },
		);
		console.log(
			`[seed-fleet] vehicle ${vehicle.callsign} (${slug}) — id=${v._id.toHexString()} driver=${vehicle.responderName}`,
		);

		const { address } = await wallet.createWallet(responder._id);
		console.log(
			`[seed-fleet] responder ${vehicle.responderName} — id=${responder._id} wallet=${address}`,
		);
	}

	console.log(
		`[seed-fleet] Seeded ${DEMO_FLEET.length} vehicles + drivers. Auth is Seeker SIWS — bind walletAddress at first sign-in.`,
	);
	await mongoose.disconnect();
}

main().catch((err: unknown) => {
	console.error("[seed-fleet] failed:", err);
	process.exit(1);
});
