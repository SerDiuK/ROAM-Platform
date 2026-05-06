import { createHash } from "node:crypto";
import { IncidentSchema } from "@roam/shared";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { connectDb } from "../src/db/connection.js";
import { IncidentModel } from "../src/db/models/incident.js";
import { ResponderModel } from "../src/db/models/responder.js";
import { VehicleModel } from "../src/db/models/vehicle.js";

// Demo data loader — only needs MONGODB_URL. Skips parseConfig() so it can
// run before the full auth / STT / wallet env is set up locally.
dotenv.config({ path: ".env.local" });

// Demo seed for the dispatcher right-sidebar. Idempotent: deletes anything
// with the `demo-` _id prefix before re-inserting. Run with:
//   pnpm --filter @roam/backend exec tsx scripts/seed-demo-incidents.ts

const PREFIX = "demo-";

type DemoIncidentSeed = {
	suffix: string;
	minutesAgo: number;
	status: "responding" | "arrived" | "resolved";
	urgency: 1 | 2 | 3;
	incidentType: string;
	locationDescription: string;
	location: { lat: number; lon: number };
	requiredCapabilities: "medic"[];
	transcript: string;
	assignVehicleCount: number;
	assignResponderCount: number;
	// Minutes after the call start when the dispatcher confirmed dispatch /
	// the last unit cleared scene. Set on responding/arrived/resolved incidents.
	dispatchedAfterMin?: number;
	clearedAfterMin?: number;
};

// Times are minutes-ago at script run; the sidebar will render relative times
// like "2 min ago" / "1 h ago".
const SEEDS: DemoIncidentSeed[] = [
	{
		suffix: "responding-overtown",
		minutesAgo: 6,
		status: "responding",
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
	},
	{
		suffix: "arrived-edgewater",
		minutesAgo: 18,
		status: "arrived",
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
	},
	{
		suffix: "resolved-grove",
		minutesAgo: 47,
		status: "resolved",
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
	// Mongoose typings default `_id` to ObjectId, but the responder schema
	// overrides it to String. Cast to the runtime shape.
	const opDocs = responders as unknown as { _id: string }[];
	return {
		vehicleIds: vehicles.map((v) => v._id.toHexString()),
		responderIds: opDocs.map((o) => o._id),
	};
}

async function clearExisting(): Promise<number> {
	const res = await IncidentModel.deleteMany({
		_id: { $regex: new RegExp(`^${PREFIX}`) },
	});
	return res.deletedCount ?? 0;
}

async function seed(): Promise<void> {
	const mongoUrl = process.env.MONGODB_URL;
	if (!mongoUrl) {
		console.error("MONGODB_URL is required (set it in apps/backend/.env.local)");
		process.exit(1);
	}
	await connectDb(mongoUrl, console);

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
			const dispatchedAt =
				seed.dispatchedAfterMin !== undefined
					? new Date(callStartedAt.getTime() + seed.dispatchedAfterMin * 60_000)
					: undefined;
			const clearedAt =
				seed.clearedAfterMin !== undefined
					? new Date(callStartedAt.getTime() + seed.clearedAfterMin * 60_000)
					: undefined;
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
				status: seed.status,
				assigned,
				dispatchedAt,
				clearedAt,
			};
			// Validate before save so a schema drift fails fast in dev.
			IncidentSchema.parse({
				...doc,
				createdAt: callStartedAt,
				updatedAt: callStartedAt,
			});
			await IncidentModel.create(doc);
			console.log(`  + ${seed.status.padEnd(10)} P${seed.urgency} ${_id}`);
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
