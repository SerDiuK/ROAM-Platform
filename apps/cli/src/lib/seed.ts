import { randomUUID } from "node:crypto";
import { computeBriefingHash } from "@roam/shared";
import {
	BriefingModel,
	IncidentModel,
	ResponderModel,
	VehicleModel,
} from "./db.js";

export type SeededBriefing = {
	incidentId: string;
	briefingId: string;
	recommendedResponderIds: string[];
	recommendedVehicleIds: string[];
	summary: string;
};

export type SeedOptions = {
	transcript?: string;
	summary?: string;
	incidentType?: string;
	totalUsdc?: number;
	responderCount?: number;
	responderName?: string;
	vehicleCount?: number;
};

const DEFAULT_TRANSCRIPT =
	"Multi-vehicle crash at Biscayne Blvd & NE 36th St. Two cars, multiple injuries reported, possible entrapment.";
const DEFAULT_SUMMARY =
	"Multi-vehicle crash at Biscayne Blvd & NE 36th St. Two cars, multiple injuries, possible entrapment. Lights & sirens.";

export async function seedBriefing(
	options: SeedOptions = {},
): Promise<SeededBriefing> {
	const responders = options.responderName
		? await ResponderModel.find({
				role: "responder",
				name: options.responderName,
			}).lean()
		: await ResponderModel.find({ role: "responder" })
				.limit(options.responderCount ?? 2)
				.lean();
	const vehicles = await VehicleModel.find()
		.limit(options.vehicleCount ?? 2)
		.lean();

	if (responders.length === 0) {
		throw new Error(
			options.responderName
				? `No responder with name "${options.responderName}" — run \`pnpm --filter @roam/backend seed\` or check the name.`
				: "No seeded responders found — run `pnpm --filter @roam/backend seed` first.",
		);
	}
	if (vehicles.length === 0) {
		throw new Error(
			"No seeded vehicles found — run `pnpm --filter @roam/backend seed` first.",
		);
	}

	const recommendedResponderIds = responders.map(
		(r) => (r as { _id: string })._id,
	);
	const recommendedVehicleIds = vehicles.map((v) =>
		String((v as { _id: unknown })._id),
	);

	const summary = options.summary ?? DEFAULT_SUMMARY;
	const transcript = options.transcript ?? DEFAULT_TRANSCRIPT;
	const totalUsdc = options.totalUsdc ?? 25;
	const payout = {
		baseUsdc: 10,
		urgencyMultiplier: 2,
		hazmatMultiplier: 1,
		distanceMultiplier: 1.25,
		totalUsdc,
	};

	const incidentId = randomUUID();
	const briefingId = randomUUID();

	await IncidentModel.create({
		_id: incidentId,
		callStartedAt: new Date(),
		transcript,
		transcriptHash: "cli-seed-no-hash",
		classification: {
			incidentType: options.incidentType ?? "MVA — entrapment",
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
		generatedByModel: "cli-seed",
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

	return {
		incidentId,
		briefingId,
		recommendedResponderIds,
		recommendedVehicleIds,
		summary,
	};
}
