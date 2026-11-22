// Needs the backend running on localhost:3001.

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
	const responderName = process.argv[2] ?? "THOMAS-1";
	const config = parseConfig();
	await connectDb(config.MONGODB_URL, console);

	const responder = await ResponderModel.findOne({
		name: responderName,
	}).lean();
	if (!responder) {
		throw new Error(`No responder named ${responderName}`);
	}
	if (!responder.pushTokens || responder.pushTokens.length === 0) {
		throw new Error(
			`Responder ${responderName} has no push tokens — boot the mobile app and sign in first`,
		);
	}
	if (!responder.walletAddress) {
		throw new Error(
			`Responder ${responderName} has no walletAddress — sign in via SIWS first`,
		);
	}

	const vehicle = await VehicleModel.findOne().lean();
	if (!vehicle) {
		throw new Error(
			"No vehicles seeded — run pnpm --filter @roam/backend fleet:seed",
		);
	}

	const incidentId = randomUUID();
	const briefingId = randomUUID();
	const summary =
		"Cardiac arrest, Collins Ave & 21st St. Patient unresponsive, bystander performing CPR.";
	const recommendedResponderIds = [responder._id];
	const recommendedVehicleIds = [String(vehicle._id)];
	const payout = {
		baseUsdc: 50,
		urgencyMultiplier: 1,
		hazmatMultiplier: 1,
		distanceMultiplier: 1,
		totalUsdc: 50,
	};

	await IncidentModel.create({
		_id: incidentId,
		callStartedAt: new Date(),
		transcript: "Caller reports unconscious patient at Collins & 21st",
		transcriptHash:
			"a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
		classification: {
			incidentType: "Cardiac arrest",
			urgency: 1,
			locationDescription: "Collins Ave & 21st St",
			requiredCapabilities: ["medic"],
		},
		status: "live",
		assigned: { vehicles: [], responders: [] },
	});

	await BriefingModel.create({
		_id: briefingId,
		incidentId,
		generatedAt: new Date(),
		generatedByModel: "test-flow",
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

	console.log(
		JSON.stringify(
			{
				incidentId,
				briefingId,
				responder: { id: responder._id, name: responder.name },
				vehicle: { id: vehicle._id, callsign: vehicle.callsign },
			},
			null,
			2,
		),
	);

	const res = await fetch("http://localhost:3001/api/dispatch/confirm", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			briefingId,
			decisionMaker: "human",
			decidedBy: responder._id,
			requiredAccepts: 1,
			expiresInSecs: 120,
		}),
	});
	const text = await res.text();
	console.log("dispatch.confirm:", res.status, text.slice(0, 300));

	await mongoose.disconnect();
}

main().catch((err: unknown) => {
	console.error(err);
	process.exit(1);
});
