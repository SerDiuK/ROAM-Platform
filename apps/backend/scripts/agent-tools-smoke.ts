import { createHash, randomUUID } from "node:crypto";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { connectDb } from "../src/db/connection.js";
import { IncidentModel } from "../src/db/models/incident.js";
import { ResponderModel } from "../src/db/models/responder.js";
import { VehicleModel } from "../src/db/models/vehicle.js";
import { VehicleSpecModel } from "../src/db/models/vehicleSpec.js";
import {
	agentTools,
	dispatchToolCall,
} from "../src/agent/tools/index.js";
import type { AgentToolContext } from "../src/agent/tools/index.js";

// AD-5 smoke: seed three vehicles + responders around Miami, then call every
// agent tool once and pretty-print the result. Demo-purpose only — does not
// hit Anthropic. Run with:
//   pnpm --filter @roam/backend agent:smoke
//
// Idempotent: every doc gets a `smoke-agent-tools-` prefix that we wipe at the
// start and end of the run.

dotenv.config({ path: ".env.local" });
const MONGODB_URL = process.env.MONGODB_URL;
if (!MONGODB_URL) {
	console.error("MONGODB_URL is required (set it in apps/backend/.env.local)");
	process.exit(1);
}

const PREFIX = "smoke-agent-tools-";

// Miami origin point used as the dispatch query target.
const ORIGIN = { lat: 25.7617, lon: -80.1918 };

interface SeededResponder {
	id: string;
	name: string;
	capabilities: "medic"[];
	withWallet: boolean;
}

interface SeededVehicle {
	callsign: string;
	lat: number;
	lon: number;
	responderId: string;
}

const RESPONDER_SEEDS: SeededResponder[] = [
	{ id: randomUUID(), name: `${PREFIX}MEDIC-1`, capabilities: ["medic"], withWallet: true },
	{ id: randomUUID(), name: `${PREFIX}MEDIC-2`, capabilities: ["medic"], withWallet: true },
	{ id: randomUUID(), name: `${PREFIX}MEDIC-3`, capabilities: ["medic"], withWallet: false },
];

function vehicleSeeds(responders: SeededResponder[]): SeededVehicle[] {
	// Three points fanning out from ORIGIN at roughly 0.5km, 1.2km, 3km.
	return [
		{ callsign: `${PREFIX}V-NEAR`, lat: 25.7660, lon: -80.1930, responderId: responders[0].id },
		{ callsign: `${PREFIX}V-MID`, lat: 25.7720, lon: -80.1820, responderId: responders[1].id },
		{ callsign: `${PREFIX}V-FAR`, lat: 25.7880, lon: -80.1700, responderId: responders[2].id },
	];
}

const prefixRegex = new RegExp(`^${PREFIX}`);

async function cleanup(): Promise<void> {
	await Promise.all([
		IncidentModel.deleteMany({ _id: { $regex: prefixRegex } }),
		ResponderModel.deleteMany({ name: { $regex: prefixRegex } }),
		VehicleModel.deleteMany({ callsign: { $regex: prefixRegex } }),
		VehicleSpecModel.deleteMany({ slug: { $regex: prefixRegex } }),
	]);
}

async function seed(): Promise<void> {
	const spec = await new VehicleSpecModel({
		slug: `${PREFIX}spec`,
		manufacturer: "ROAM",
		name: "Smoke Vehicle",
		imageUrl: "https://example.com/smoke.png",
	}).save();

	for (const op of RESPONDER_SEEDS) {
		await new ResponderModel({
			_id: op.id,
			name: op.name,
			role: "responder",
			availability: "available",
			capabilities: op.capabilities,
			...(op.withWallet
				? { walletAddress: "11111111111111111111111111111111" }
				: {}),
		}).save();
	}

	for (const v of vehicleSeeds(RESPONDER_SEEDS)) {
		await new VehicleModel({
			callsign: v.callsign,
			model: spec._id,
			status: "available",
			assignedResponderIds: [v.responderId],
			lastTelemetry: {
				lat: v.lat,
				lon: v.lon,
				speed: 0,
				heading: 0,
				timestamp: new Date(),
			},
		}).save();
	}

	const transcript =
		"Cardiac event at Biscayne and 36th, two casualties, victim is unconscious.";
	await new IncidentModel({
		_id: `${PREFIX}incident-active`,
		callStartedAt: new Date(),
		transcript,
		transcriptHash: createHash("sha256").update(transcript).digest("hex"),
		status: "live",
		assigned: { vehicles: [], responders: [] },
		classification: {
			incidentType: "Medical emergency",
			urgency: 1,
			locationDescription: "Biscayne and 36th",
			requiredCapabilities: ["medic"],
		},
	}).save();
}

function makeCtx(): AgentToolContext {
	return { log: console };
}

function pretty(label: string, value: unknown): void {
	console.log(`\n[${label}]`);
	console.log(JSON.stringify(value, null, 2));
}

async function main(): Promise<void> {
	if (!MONGODB_URL) throw new Error("MONGODB_URL missing");
	await connectDb(MONGODB_URL, console);
	try {
		await cleanup();
		await seed();
		await mongoose.connection.syncIndexes();

		console.log(
			`Registered ${agentTools.length} agent tools: ${agentTools.map((t) => t.name).join(", ")}`,
		);

		const ctx = makeCtx();

		const classified = await dispatchToolCall(
			"classify_incident",
			{
				transcript:
					"Cardiac event at Biscayne and 36th, two casualties, victim is unconscious.",
			},
			ctx,
		);
		pretty("classify_incident", classified);

		const nearestAny = await dispatchToolCall(
			"find_nearest_vehicles",
			{ lat: ORIGIN.lat, lon: ORIGIN.lon, radiusKm: 10 },
			ctx,
		);
		pretty("find_nearest_vehicles (no capability filter)", nearestAny);

		const nearestMedic = await dispatchToolCall(
			"find_nearest_vehicles",
			{
				lat: ORIGIN.lat,
				lon: ORIGIN.lon,
				radiusKm: 10,
				requiredCapabilities: ["medic"],
			},
			ctx,
		);
		pretty("find_nearest_vehicles (medic only)", nearestMedic);

		const responderStatus = await dispatchToolCall(
			"get_responder_status",
			{
				responderIds: [
					...RESPONDER_SEEDS.map((o) => o.id),
					"unknown-responder-id",
				],
			},
			ctx,
		);
		pretty("get_responder_status (incl. unknown id)", responderStatus);

		const active = await dispatchToolCall("get_active_incidents", {}, ctx);
		pretty("get_active_incidents", active);

		console.log("\nAll tools answered without error.");
	} finally {
		await cleanup();
		await mongoose.disconnect();
	}
}

main().catch((err: unknown) => {
	console.error("[agent-tools-smoke] failed:", err);
	process.exit(1);
});
