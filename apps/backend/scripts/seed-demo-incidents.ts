import { createHash } from "node:crypto";
import { IncidentSchema } from "@roam/shared";
import mongoose from "mongoose";
import { parseConfig } from "../src/config.js";
import { connectDb } from "../src/db/connection.js";
import { IncidentModel } from "../src/db/models/incident.js";
import { ResponderModel } from "../src/db/models/responder.js";
import { VehicleModel } from "../src/db/models/vehicle.js";

const PREFIX = "demo-";

type DemoIncidentSeed = {
	suffix: string;
	minutesAgo: number;
	urgency: 1 | 2 | 3;
	incidentType: string;
	locationDescription: string;
	location: { lat: number; lon: number };
	requiredCapabilities: "medic"[];
	transcript: string;
	assignVehicleCount: number;
	assignResponderCount: number;
	dispatchedAfterMin: number;
	clearedAfterMin: number;
};

const SEEDS: DemoIncidentSeed[] = [
	{
		suffix: "overtown",
		minutesAgo: 92,
		urgency: 1,
		incidentType: "Structure fire — occupants",
		locationDescription: "NW 3rd Ave & 14th St, Overtown",
		location: { lat: 25.7889, lon: -80.2014 },
		requiredCapabilities: ["medic"],
		transcript:
			"Fire on the second floor, smoke everywhere, my neighbor is still inside.",
		assignVehicleCount: 2,
		assignResponderCount: 2,
		dispatchedAfterMin: 1,
		clearedAfterMin: 48,
	},
	{
		suffix: "edgewater",
		minutesAgo: 18,
		urgency: 2,
		incidentType: "Fall — elderly",
		locationDescription: "NE 2nd Ave & 30th St, Edgewater",
		location: { lat: 25.8019, lon: -80.1908 },
		requiredCapabilities: ["medic"],
		transcript:
			"My mother fell in the bathroom, she's conscious but can't get up. Apartment 1804.",
		assignVehicleCount: 1,
		assignResponderCount: 1,
		dispatchedAfterMin: 2,
		clearedAfterMin: 14,
	},
	{
		suffix: "grove",
		minutesAgo: 47,
		urgency: 3,
		incidentType: "Vehicle stuck — non-injury",
		locationDescription: "S Bayshore Dr, Coconut Grove",
		location: { lat: 25.7286, lon: -80.2418 },
		requiredCapabilities: ["medic"],
		transcript:
			"Car slid into the swale after the rain. No one's hurt, just need a tow.",
		assignVehicleCount: 1,
		assignResponderCount: 1,
		dispatchedAfterMin: 1,
		clearedAfterMin: 18,
	},
];

function hash(input: string): string {
	return createHash("sha256").update(input).digest("hex");
}

async function pickAvailableIds(): Promise<{
	vehicleIds: string[];
	responderIds: string[];
}> {
	const [vehicles, responders] = await Promise.all([
		VehicleModel.find().select({ _id: 1 }).limit(10).lean(),
		ResponderModel.find().select({ _id: 1 }).limit(10).lean(),
	]);
	return {
		vehicleIds: vehicles.map((v) => v._id.toHexString()),
		responderIds: responders.map((r) => r._id),
	};
}

async function clearExisting(): Promise<number> {
	const res = await IncidentModel.deleteMany({
		_id: { $regex: new RegExp(`^${PREFIX}`) },
	});
	return res.deletedCount ?? 0;
}

async function seed(): Promise<void> {
	await connectDb(parseConfig().MONGODB_URL, console);

	try {
		const cleared = await clearExisting();
		console.log(`Cleared ${cleared} existing demo incidents`);

		const { vehicleIds, responderIds } = await pickAvailableIds();
		console.log(
			`Pool: ${vehicleIds.length} vehicle(s), ${responderIds.length} responder(s)`,
		);

		const now = Date.now();
		for (const seed of SEEDS) {
			const _id = `${PREFIX}incident-${seed.suffix}`;
			const callStartedAt = new Date(now - seed.minutesAgo * 60_000);
			const dispatchedAt = new Date(
				callStartedAt.getTime() + seed.dispatchedAfterMin * 60_000,
			);
			const clearedAt = new Date(
				callStartedAt.getTime() + seed.clearedAfterMin * 60_000,
			);
			const assigned = {
				vehicles: vehicleIds.slice(0, seed.assignVehicleCount),
				responders: responderIds.slice(0, seed.assignResponderCount),
			};
			const doc = {
				_id,
				callStartedAt,
				transcript: seed.transcript,
				transcriptHash: hash(seed.transcript),
				classification: {
					incidentType: seed.incidentType,
					urgency: seed.urgency,
					location: seed.location,
					locationDescription: seed.locationDescription,
					requiredCapabilities: seed.requiredCapabilities,
				},
				status: "resolved",
				assigned,
				dispatchedAt,
				clearedAt,
			};
			IncidentSchema.parse({
				...doc,
				createdAt: callStartedAt,
				updatedAt: callStartedAt,
			});
			await IncidentModel.create(doc);
			console.log(`  + P${seed.urgency} ${_id}`);
		}

		console.log(`\nSeeded ${SEEDS.length} demo incidents`);
	} finally {
		await mongoose.disconnect();
	}
}

seed().catch((err: unknown) => {
	console.error("[seed-demo-incidents] failed:", err);
	process.exit(1);
});
