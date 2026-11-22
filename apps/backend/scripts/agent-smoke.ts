import { createHash, randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { brief, computeBriefingHash } from "../src/agent/runner.js";
import { connectDb } from "../src/db/connection.js";
import { BriefingModel } from "../src/db/models/briefing.js";
import { IncidentModel } from "../src/db/models/incident.js";
import { ResponderModel } from "../src/db/models/responder.js";
import { VehicleModel } from "../src/db/models/vehicle.js";
import { VehicleSpecModel } from "../src/db/models/vehicleSpec.js";

dotenv.config({ path: ".env.local" });

const MONGODB_URL = process.env.MONGODB_URL;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
const AGENT_MAX_TURNS = Number(process.env.AGENT_MAX_TURNS ?? 8);
const AGENT_MAX_TOKENS = Number(process.env.AGENT_MAX_TOKENS ?? 16384);

if (!MONGODB_URL) {
	console.error("MONGODB_URL is required (set it in apps/backend/.env.local)");
	process.exit(1);
}
if (!ANTHROPIC_API_KEY) {
	console.error(
		"ANTHROPIC_API_KEY is required (set it in apps/backend/.env.local)",
	);
	process.exit(1);
}

const PREFIX = "smoke-agent-";
const SCENE = { lat: 25.808, lon: -80.19 };

const RESPONDERS = [
	{ id: randomUUID(), name: `${PREFIX}MEDIC-1`, withWallet: true },
	{ id: randomUUID(), name: `${PREFIX}MEDIC-2`, withWallet: true },
	{ id: randomUUID(), name: `${PREFIX}MEDIC-3`, withWallet: true },
] as const;

const VEHICLES = [
	{
		callsign: `${PREFIX}V-NEAR`,
		lat: 25.766,
		lon: -80.193,
		responderId: RESPONDERS[0].id,
	},
	{
		callsign: `${PREFIX}V-MID`,
		lat: 25.772,
		lon: -80.182,
		responderId: RESPONDERS[1].id,
	},
	{
		callsign: `${PREFIX}V-FAR`,
		lat: 25.788,
		lon: -80.17,
		responderId: RESPONDERS[2].id,
	},
];

const TRANSCRIPT =
	"911, what's your emergency? — There's been a multi-vehicle crash at Biscayne Boulevard and Northeast 36th Street in Miami. Two cars t-boned. I see at least two people unconscious, one of them is bleeding badly. Please hurry.";

const prefixRegex = new RegExp(`^${PREFIX}`);
const SMOKE_INCIDENT_ID = `${PREFIX}incident-${Date.now()}`;

async function cleanup(): Promise<void> {
	await Promise.all([
		IncidentModel.deleteMany({ _id: { $regex: prefixRegex } }),
		ResponderModel.deleteMany({ name: { $regex: prefixRegex } }),
		VehicleModel.deleteMany({ callsign: { $regex: prefixRegex } }),
		VehicleSpecModel.deleteMany({ slug: { $regex: prefixRegex } }),
		BriefingModel.deleteMany({ incidentId: { $regex: prefixRegex } }),
	]);
}

async function seed(): Promise<void> {
	const spec = await new VehicleSpecModel({
		slug: `${PREFIX}spec`,
		manufacturer: "ROAM",
		name: "Smoke Vehicle",
		imageUrl: "https://example.com/smoke.png",
	}).save();

	for (const r of RESPONDERS) {
		await new ResponderModel({
			_id: r.id,
			name: r.name,
			role: "responder",
			availability: "available",
			capabilities: ["medic"],
			...(r.withWallet
				? { walletAddress: "11111111111111111111111111111111" }
				: {}),
		}).save();
	}

	for (const v of VEHICLES) {
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

	await new IncidentModel({
		_id: SMOKE_INCIDENT_ID,
		callStartedAt: new Date(),
		transcript: TRANSCRIPT,
		transcriptHash: createHash("sha256").update(TRANSCRIPT).digest("hex"),
		status: "live",
		assigned: { vehicles: [], responders: [] },
		classification: {
			incidentType: "Vehicle collision",
			urgency: 1,
			location: SCENE,
			locationDescription: "Biscayne Blvd & NE 36th St, Miami",
			requiredCapabilities: ["medic"],
		},
	}).save();
}

async function main(): Promise<void> {
	if (!MONGODB_URL) throw new Error("MONGODB_URL missing");
	await connectDb(MONGODB_URL, console);
	try {
		await cleanup();
		await seed();
		await mongoose.connection.syncIndexes();

		const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

		console.log(
			`Running brief() against ${ANTHROPIC_MODEL} (maxTurns=${AGENT_MAX_TURNS}, maxTokens=${AGENT_MAX_TOKENS}, effort=low)…`,
		);
		const start = Date.now();
		const briefing = await brief(SMOKE_INCIDENT_ID, {
			client,
			model: ANTHROPIC_MODEL,
			maxTokens: AGENT_MAX_TOKENS,
			maxTurns: AGENT_MAX_TURNS,
			log: console,
			effort: "low",
			onTurn: ({ turn, ms, toolUseCount, usage }) => {
				const cacheRead = usage.cache_read_input_tokens ?? 0;
				const cacheWrite = usage.cache_creation_input_tokens ?? 0;
				console.log(
					`  turn ${turn}: ${ms}ms, ${toolUseCount} tool_use, ` +
						`${usage.input_tokens} in (cache: ${cacheRead} read, ${cacheWrite} write) / ${usage.output_tokens} out`,
				);
			},
		});
		const elapsed = Date.now() - start;

		console.log(`\nBriefing produced in ${elapsed}ms:\n`);
		console.log(JSON.stringify(briefing, null, 2));

		const recomputed = computeBriefingHash({
			summary: briefing.summary,
			recommendedVehicleIds: briefing.recommendedVehicleIds,
			recommendedResponderIds: briefing.recommendedResponderIds,
			payout: briefing.payout,
		});
		if (recomputed !== briefing.briefingHash) {
			throw new Error(
				`briefingHash mismatch: persisted=${briefing.briefingHash}, recomputed=${recomputed}`,
			);
		}
		console.log(`\n✓ briefingHash deterministic: ${briefing.briefingHash}`);
	} finally {
		await cleanup();
		await mongoose.disconnect();
	}
}

main().catch((err: unknown) => {
	console.error("[agent-smoke] failed:", err);
	process.exit(1);
});
