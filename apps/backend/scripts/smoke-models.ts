import { randomUUID } from "node:crypto";
import {
	BriefingSchema,
	DispatchResponseSchema,
	DispatchSchema,
	IncidentSchema,
	PayoutSchema,
	ResponderSchema,
	VehicleSchema,
} from "@roam/shared";
import mongoose from "mongoose";
import { parseConfig } from "../src/config.js";
import { connectDb } from "../src/db/connection.js";
import { BriefingModel } from "../src/db/models/briefing.js";
import { DispatchModel } from "../src/db/models/dispatch.js";
import { DispatchResponseModel } from "../src/db/models/dispatchResponse.js";
import { IncidentModel } from "../src/db/models/incident.js";
import { PayoutModel } from "../src/db/models/payout.js";
import { ResponderModel } from "../src/db/models/responder.js";
import { VehicleModel } from "../src/db/models/vehicle.js";
import { VehicleSpecModel } from "../src/db/models/vehicleSpec.js";

// AD-1 smoke test: every new + extended model round-trips through Mongoose
// and its Zod schema. Run with:
//   pnpm --filter @roam/backend exec tsx scripts/smoke-models.ts

const PREFIX = "smoke-AD1-";

type CheckResult = { name: string; ok: boolean; message: string };
const results: CheckResult[] = [];

function ok(name: string, message = ""): void {
	console.log(`[OK] ${name}${message ? ` — ${message}` : ""}`);
	results.push({ name, ok: true, message });
}

function fail(name: string, err: unknown): void {
	const message = err instanceof Error ? err.message : String(err);
	console.log(`[FAIL] ${name}: ${message}`);
	results.push({ name, ok: false, message });
}

// JSON-serialize then re-parse to coerce ObjectId → hex string and Date → ISO
// string, matching what the HTTP API does. Lets Zod schemas (with z.string()
// `_id` and z.coerce.date() timestamps) round-trip cleanly off raw lean docs.
function toWire<T>(doc: unknown): T {
	return JSON.parse(JSON.stringify(doc)) as T;
}

const prefixRegex = new RegExp(`^${PREFIX}`);

async function cleanup(): Promise<void> {
	await Promise.all([
		IncidentModel.deleteMany({ _id: { $regex: prefixRegex } }),
		BriefingModel.deleteMany({ _id: { $regex: prefixRegex } }),
		DispatchModel.deleteMany({ _id: { $regex: prefixRegex } }),
		DispatchResponseModel.deleteMany({ _id: { $regex: prefixRegex } }),
		PayoutModel.deleteMany({ _id: { $regex: prefixRegex } }),
		ResponderModel.deleteMany({ name: { $regex: prefixRegex } }),
		VehicleModel.deleteMany({ callsign: { $regex: prefixRegex } }),
		VehicleSpecModel.deleteMany({ slug: { $regex: prefixRegex } }),
	]);
}

async function checkIncident(): Promise<void> {
	const id = `${PREFIX}incident-${randomUUID()}`;
	await new IncidentModel({
		_id: id,
		callStartedAt: new Date(),
		transcript: "Test 911 call transcript",
		transcriptHash: "deadbeef".repeat(8),
		classification: {
			incidentType: "vehicle-collision",
			urgency: 1,
			location: { lat: 25.7617, lon: -80.1918 },
			locationDescription: "Brickell Ave & SE 1st St",
			requiredCapabilities: ["medic"],
		},
		status: "live",
		assigned: { vehicles: [], responders: [] },
	}).save();
	const doc = await IncidentModel.findById(id).lean();
	if (!doc) throw new Error("not found after save");
	IncidentSchema.parse(toWire(doc));
	ok("Incident");
}

async function checkBriefing(): Promise<void> {
	const id = `${PREFIX}briefing-${randomUUID()}`;
	await new BriefingModel({
		_id: id,
		incidentId: `${PREFIX}incident-fake`,
		generatedAt: new Date(),
		generatedByModel: "claude-opus-4-7",
		summary: "Two-car collision on Brickell Ave; one injury reported.",
		recommendedVehicleIds: [],
		recommendedResponderIds: [],
		payout: {
			baseUsdc: 50,
			urgencyMultiplier: 1.5,
			hazmatMultiplier: 1.0,
			distanceMultiplier: 1.0,
			totalUsdc: 75,
		},
		briefingHash: "cafe1234".repeat(8),
	}).save();
	const doc = await BriefingModel.findById(id).lean();
	if (!doc) throw new Error("not found after save");
	BriefingSchema.parse(toWire(doc));
	ok("Briefing");
}

async function checkDispatch(): Promise<void> {
	const id = `${PREFIX}dispatch-${randomUUID()}`;
	await new DispatchModel({
		_id: id,
		incidentId: `${PREFIX}incident-fake`,
		briefingId: `${PREFIX}briefing-fake`,
		decisionMaker: "ai-auto",
		decidedAt: new Date(),
		assignedVehicleIds: [],
		assignedResponderIds: [],
		payoutUsdc: 75,
		requiredAccepts: 1,
		status: "pending",
		claimedByResponderIds: [],
		expiresAt: new Date(Date.now() + 60_000),
	}).save();
	const doc = await DispatchModel.findById(id).lean();
	if (!doc) throw new Error("not found after save");
	DispatchSchema.parse(toWire(doc));
	ok("Dispatch");
}

async function checkDispatchResponse(): Promise<void> {
	const id = `${PREFIX}dispatch-response-${randomUUID()}`;
	await new DispatchResponseModel({
		_id: id,
		dispatchId: `${PREFIX}dispatch-fake`,
		responderId: `${PREFIX}responder-fake`,
		decision: "accept",
		respondedAt: new Date(),
	}).save();
	const doc = await DispatchResponseModel.findById(id).lean();
	if (!doc) throw new Error("not found after save");
	DispatchResponseSchema.parse(toWire(doc));
	ok("DispatchResponse");
}

async function checkPayout(): Promise<void> {
	const id = `${PREFIX}payout-${randomUUID()}`;
	await new PayoutModel({
		_id: id,
		dispatchId: `${PREFIX}dispatch-fake`,
		responderId: `${PREFIX}responder-fake`,
		recipientWalletAddress: "11111111111111111111111111111111",
		amountUsdc: 75,
		status: "pending",
		initiatedAt: new Date(),
	}).save();
	const doc = await PayoutModel.findById(id).lean();
	if (!doc) throw new Error("not found after save");
	PayoutSchema.parse(toWire(doc));
	ok("Payout");
}

async function checkResponder(): Promise<void> {
	const id = randomUUID();
	const name = `${PREFIX}rsp-${id.slice(0, 8)}`;
	await new ResponderModel({
		_id: id,
		name,
		role: "responder",
		availability: "available",
		capabilities: ["medic"],
		pushTokens: ["ExponentPushToken[smoke]"],
		walletAddress: "11111111111111111111111111111111",
	}).save();
	const doc = await ResponderModel.findById(id).lean();
	if (!doc) throw new Error("not found after save");
	ResponderSchema.parse(toWire(doc));
	ok("Responder (extended)");
}

async function checkVehicle(): Promise<void> {
	const slug = `${PREFIX}spec-${randomUUID().slice(0, 8)}`;
	const callsign = `${PREFIX}veh-${randomUUID().slice(0, 8)}`;

	const spec = await new VehicleSpecModel({
		slug,
		manufacturer: "Test Manufacturer",
		name: "Test Vehicle Spec",
		imageUrl: "https://example.com/spec.png",
	}).save();

	const vehicle = await new VehicleModel({
		callsign,
		model: spec._id,
		status: "available",
		assignedResponderIds: [randomUUID()],
		lastTelemetry: {
			lat: 25.7617,
			lon: -80.1918,
			speed: 25,
			heading: 90,
			batteryPct: 80,
			timestamp: new Date(),
		},
	}).save();

	const doc = await VehicleModel.findById(vehicle._id)
		.populate("model")
		.lean();
	if (!doc) throw new Error("not found after save");

	const wire = toWire<{
		lastTelemetry?: { location?: { type: string; coordinates: number[] } };
	}>(doc);
	const coords = wire.lastTelemetry?.location?.coordinates;
	if (!coords || coords[0] !== -80.1918 || coords[1] !== 25.7617) {
		throw new Error(
			`pre-save did not derive location: expected [-80.1918, 25.7617], got ${JSON.stringify(coords)}`,
		);
	}

	VehicleSchema.parse(wire);
	ok("Vehicle (extended)", "pre-save GeoJSON Point derived");
}

async function checkVehicleGeoIndex(): Promise<void> {
	const indexes = await VehicleModel.collection.indexes();
	const has2dsphere = indexes.some(
		(i) => i.key && i.key["lastTelemetry.location"] === "2dsphere",
	);
	if (!has2dsphere) {
		const keys = indexes.map((i) => i.key);
		throw new Error(`2dsphere index missing. Got: ${JSON.stringify(keys)}`);
	}
	ok("Vehicle 2dsphere index");
}

async function main(): Promise<void> {
	const config = parseConfig();
	await connectDb(config.MONGODB_URL, console);

	const checks: { name: string; fn: () => Promise<void> }[] = [
		{ name: "Incident", fn: checkIncident },
		{ name: "Briefing", fn: checkBriefing },
		{ name: "Dispatch", fn: checkDispatch },
		{ name: "DispatchResponse", fn: checkDispatchResponse },
		{ name: "Payout", fn: checkPayout },
		{ name: "Responder (extended)", fn: checkResponder },
		{ name: "Vehicle (extended)", fn: checkVehicle },
		{ name: "Vehicle 2dsphere index", fn: checkVehicleGeoIndex },
	];

	try {
		await cleanup();
		for (const check of checks) {
			try {
				await check.fn();
			} catch (err) {
				fail(check.name, err);
			}
		}
	} finally {
		await cleanup();
		await mongoose.disconnect();
	}

	const failed = results.filter((r) => !r.ok);
	if (failed.length > 0) {
		console.error(`\n${failed.length} check(s) failed`);
		process.exit(1);
	}
	console.log("\nAll checks passed");
}

main().catch((err: unknown) => {
	console.error("[smoke-models] failed:", err);
	process.exit(1);
});
