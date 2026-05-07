// One-shot seeder for manual AD-8 testing: creates an Incident + a Briefing
// with the canonical briefingHash so dispatch.confirm passes the hash check.
// Bypasses the agent — useful when you want to exercise dispatch.confirm /
// commitSignedResponse without depending on the LLM tool-use loop.
//
// Usage: pnpm --filter @roam/backend test-dispatch:seed
//        # then read the printed BRIEFING_ID and use it with /api/dispatch/confirm

import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { computeBriefingHash } from "../src/agent/runner.js";
import { parseConfig } from "../src/config.js";
import { connectDb } from "../src/db/connection.js";
import { BriefingModel } from "../src/db/models/briefing.js";
import { IncidentModel } from "../src/db/models/incident.js";
import { ResponderModel } from "../src/db/models/responder.js";
import { VehicleModel } from "../src/db/models/vehicle.js";

async function main(): Promise<void> {
	const config = parseConfig();
	await connectDb(config.MONGODB_URL, console);

	const responders = await ResponderModel.find({ role: "responder" })
		.limit(2)
		.lean();
	const vehicles = await VehicleModel.find().limit(2).lean();
	if (responders.length === 0 || vehicles.length === 0) {
		console.error(
			"Seed responders + fleet first: pnpm --filter @roam/backend seed",
		);
		await mongoose.disconnect();
		process.exit(1);
	}

	const recommendedResponderIds = responders.map((r) => r._id);
	const recommendedVehicleIds = vehicles.map((v) => String(v._id));
	const summary =
		"Multi-vehicle crash at Biscayne Blvd & NE 36th St. Two cars, multiple injuries, possible entrapment. Lights & sirens.";
	const payout = {
		baseUsdc: 10,
		urgencyMultiplier: 2,
		hazmatMultiplier: 1,
		distanceMultiplier: 1.25,
		totalUsdc: 25,
	};

	const incidentId = randomUUID();
	const briefingId = randomUUID();
	const transcript =
		"Multi-vehicle crash at Biscayne Blvd & NE 36th St. Two cars, multiple injuries reported, possible entrapment.";

	await IncidentModel.create({
		_id: incidentId,
		callStartedAt: new Date(),
		transcript,
		transcriptHash:
			"41c7adea504a95a3ff9cb8b62ccdea7037c90a33e8f7c321189210ffe3ea565c",
		classification: {
			incidentType: "MVA — entrapment",
			urgency: 1,
			locationDescription: "Biscayne & NE 36th",
			requiredCapabilities: ["medic"],
		},
		status: "live",
		assigned: { vehicles: [], responders: [] },
	});

	await BriefingModel.create({
		_id: briefingId,
		incidentId,
		generatedAt: new Date(),
		generatedByModel: "manual-seed",
		summary,
		recommendedVehicleIds,
		recommendedResponderIds,
		payout,
		briefingHash: computeBriefingHash({
			summary,
			recommendedVehicleIds,
			recommendedResponderIds,
			payout,
		}),
	});

	console.log(JSON.stringify({ incidentId, briefingId }, null, 2));
	await mongoose.disconnect();
}

main().catch((err: unknown) => {
	console.error(err);
	process.exit(1);
});
