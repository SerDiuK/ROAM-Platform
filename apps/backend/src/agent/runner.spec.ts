import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
	fakeMessage,
	makeMockAnthropic,
	textBlock,
	toolUseBlock,
} from "../../test/anthropic-mock.js";
import { makeFakeLogger } from "../../test/factories.js";
import { BriefingModel } from "../db/models/briefing.js";
import { IncidentModel } from "../db/models/incident.js";
import {
	type BriefContext,
	BriefError,
	brief,
	computeBriefingHash,
} from "./runner.js";

const SAMPLE_PAYLOAD = {
	summary:
		"Multi-vehicle crash at Biscayne Blvd & NE 36th. Two ambulances dispatched.",
	recommendedVehicleIds: ["vehicle-1", "vehicle-2"],
	recommendedResponderIds: ["responder-1", "responder-2"],
	payout: {
		baseUsdc: 50,
		urgencyMultiplier: 2,
		hazmatMultiplier: 1,
		distanceMultiplier: 1.1,
		totalUsdc: 110,
	},
};

async function seedIncident(transcript = "test transcript"): Promise<string> {
	const id = randomUUID();
	const transcriptHash = createHash("sha256").update(transcript).digest("hex");
	await IncidentModel.create({
		_id: id,
		callStartedAt: new Date(),
		transcript,
		transcriptHash,
		status: "live",
		assigned: { vehicles: [], responders: [] },
	});
	return id;
}

const baseCtx = {
	model: "claude-opus-4-7",
	maxTokens: 1024,
	maxTurns: 5,
	// makeFakeLogger() doesn't structurally match FastifyBaseLogger's overloaded
	// LogFn signature; the existing pattern (sessionAuth.spec.ts) is to cast.
	log: makeFakeLogger() as unknown as BriefContext["log"],
};

describe("computeBriefingHash", () => {
	it("is deterministic across re-canonicalization with shuffled key order", () => {
		const reordered = {
			payout: SAMPLE_PAYLOAD.payout,
			recommendedResponderIds: SAMPLE_PAYLOAD.recommendedResponderIds,
			summary: SAMPLE_PAYLOAD.summary,
			recommendedVehicleIds: SAMPLE_PAYLOAD.recommendedVehicleIds,
		};
		expect(computeBriefingHash(SAMPLE_PAYLOAD)).toBe(
			computeBriefingHash(reordered),
		);
	});

	it("changes when any user-visible field changes", () => {
		const baseline = computeBriefingHash(SAMPLE_PAYLOAD);
		expect(
			computeBriefingHash({ ...SAMPLE_PAYLOAD, summary: "different" }),
		).not.toBe(baseline);
		expect(
			computeBriefingHash({
				...SAMPLE_PAYLOAD,
				recommendedVehicleIds: ["vehicle-2", "vehicle-1"],
			}),
		).not.toBe(baseline);
		expect(
			computeBriefingHash({
				...SAMPLE_PAYLOAD,
				payout: { ...SAMPLE_PAYLOAD.payout, totalUsdc: 111 },
			}),
		).not.toBe(baseline);
	});
});

describe("brief()", () => {
	it("persists a Briefing with the validated payload and a stable briefingHash", async () => {
		const incidentId = await seedIncident("Crash at Biscayne and 36th.");
		const responses = [
			fakeMessage(
				[toolUseBlock("draft_briefing", SAMPLE_PAYLOAD, "tu_draft")],
				"tool_use",
			),
			fakeMessage([textBlock("done")], "end_turn"),
		];
		const { client } = makeMockAnthropic(responses);

		const briefing = await brief(incidentId, { ...baseCtx, client });

		expect(briefing.incidentId).toBe(incidentId);
		expect(briefing.generatedByModel).toBe("claude-opus-4-7");
		expect(briefing.summary).toBe(SAMPLE_PAYLOAD.summary);
		expect(briefing.recommendedVehicleIds).toEqual(
			SAMPLE_PAYLOAD.recommendedVehicleIds,
		);
		expect(briefing.recommendedResponderIds).toEqual(
			SAMPLE_PAYLOAD.recommendedResponderIds,
		);
		expect(briefing.payout).toEqual(SAMPLE_PAYLOAD.payout);
		expect(briefing.briefingHash).toBe(computeBriefingHash(SAMPLE_PAYLOAD));
		expect(briefing.briefingHash).toMatch(/^[a-f0-9]{64}$/);

		const persisted = await BriefingModel.findById(briefing._id).lean();
		expect(persisted).toBeTruthy();
		expect(persisted?.summary).toBe(briefing.summary);
		expect(persisted?.briefingHash).toBe(briefing.briefingHash);
	});

	it("throws BriefError when the agent finishes without calling draft_briefing", async () => {
		const incidentId = await seedIncident();
		const responses = [
			fakeMessage([textBlock("not enough info")], "end_turn"),
		];
		const { client } = makeMockAnthropic(responses);

		await expect(
			brief(incidentId, { ...baseCtx, client }),
		).rejects.toBeInstanceOf(BriefError);
	});

	it("throws BriefError when the incident does not exist", async () => {
		const { client } = makeMockAnthropic([]);
		await expect(
			brief("missing-incident", { ...baseCtx, client }),
		).rejects.toBeInstanceOf(BriefError);
	});

	it("rejects an invalid draft_briefing payload via Zod and never persists", async () => {
		const incidentId = await seedIncident();
		// Empty recommendation arrays violate the Zod schema (min length 1).
		const invalid = { ...SAMPLE_PAYLOAD, recommendedVehicleIds: [] };
		const responses = [
			fakeMessage(
				[toolUseBlock("draft_briefing", invalid, "tu_bad")],
				"tool_use",
			),
			// After the validation error comes back as a tool_result with
			// is_error: true, the model gives up — runAgent returns and brief()
			// throws because no valid draft was captured.
			fakeMessage([textBlock("giving up")], "end_turn"),
		];
		const { client } = makeMockAnthropic(responses);

		await expect(
			brief(incidentId, { ...baseCtx, client }),
		).rejects.toBeInstanceOf(BriefError);
		const count = await BriefingModel.countDocuments({});
		expect(count).toBe(0);
	});
});
