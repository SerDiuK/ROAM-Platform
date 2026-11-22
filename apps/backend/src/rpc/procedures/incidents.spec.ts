import { createHash, randomUUID } from "node:crypto";
import { call } from "@orpc/server";
import type { Briefing, Incident } from "@roam/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	makeFakeBroadcaster,
	makeFakeLogger,
	makeFakeTranscriber,
} from "../../../test/factories.js";
import { brief } from "../../agent/runner.js";
import type { Config } from "../../config.js";
import { BriefingModel } from "../../db/models/briefing.js";
import { IncidentModel } from "../../db/models/incident.js";
import type { RpcContext } from "../context.js";
import { incidentsRouter } from "./incidents.js";

vi.mock("../../agent/runner.js", () => ({
	brief: vi.fn(),
}));

beforeEach(() => {
	vi.mocked(brief).mockReset();
});

const fakeConfig = {
	ANTHROPIC_MODEL: "claude-sonnet-4-6",
	AGENT_MAX_TURNS: 8,
} as unknown as Config;

interface ContextOverrides {
	transcriber?: ReturnType<typeof makeFakeTranscriber>;
	incidentBroadcaster?: ReturnType<typeof makeFakeBroadcaster>;
}

function buildContext(overrides: ContextOverrides = {}): RpcContext & {
	incidentBroadcaster: ReturnType<typeof makeFakeBroadcaster>;
	transcriber: ReturnType<typeof makeFakeTranscriber>;
} {
	const incidentBroadcaster =
		overrides.incidentBroadcaster ?? makeFakeBroadcaster();
	const transcriber = overrides.transcriber ?? makeFakeTranscriber();
	return {
		config: fakeConfig,
		incidentBroadcaster:
			incidentBroadcaster as unknown as RpcContext["incidentBroadcaster"],
		walletProvider: {} as RpcContext["walletProvider"],
		transcriber: transcriber as unknown as RpcContext["transcriber"],
		anthropic: {} as RpcContext["anthropic"],
		log: makeFakeLogger() as unknown as RpcContext["log"],
		user: null,
	} as RpcContext & {
		incidentBroadcaster: ReturnType<typeof makeFakeBroadcaster>;
		transcriber: ReturnType<typeof makeFakeTranscriber>;
	};
}

function makeFakeBriefing(incidentId: string): Briefing {
	return {
		_id: randomUUID(),
		incidentId,
		generatedAt: new Date(),
		generatedByModel: "claude-sonnet-4-6",
		summary: "test briefing",
		recommendedVehicleIds: ["vehicle-1"],
		recommendedResponderIds: ["responder-1"],
		payout: {
			baseUsdc: 10,
			urgencyMultiplier: 1,
			hazmatMultiplier: 1,
			distanceMultiplier: 1,
			totalUsdc: 10,
		},
		briefingHash: "deadbeef",
	};
}

describe("incidents.ingest — transcript path", () => {
	it("creates an Incident with status='live' and the correct sha256 transcriptHash", async () => {
		vi.mocked(brief).mockReturnValue(new Promise(() => {}));

		const ctx = buildContext();
		const transcript =
			"Crash at Biscayne and 36th, two cars, injuries reported.";

		const incident = await call(
			incidentsRouter.ingest,
			{ transcript },
			{ context: ctx },
		);

		expect(incident.status).toBe("live");
		expect(incident.transcript).toBe(transcript);
		expect(incident.transcriptHash).toBe(
			createHash("sha256").update(transcript).digest("hex"),
		);
		expect(incident._id).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
		);
		const persisted = await IncidentModel.findById(incident._id).lean();
		expect(persisted?.transcript).toBe(transcript);
		expect(persisted?.status).toBe("live");
	});

	it("broadcasts incident.created and kicks off brief() without awaiting it", async () => {
		vi.mocked(brief).mockReturnValue(new Promise(() => {}));

		const ctx = buildContext();

		const incident = await call(
			incidentsRouter.ingest,
			{ transcript: "test transcript" },
			{ context: ctx },
		);

		expect(brief).toHaveBeenCalledTimes(1);
		expect(brief).toHaveBeenCalledWith(
			incident._id,
			expect.objectContaining({
				model: "claude-sonnet-4-6",
				maxTurns: 8,
			}),
		);
		expect(ctx.incidentBroadcaster.broadcast).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "incident.created",
				incident: expect.objectContaining({ _id: incident._id }),
			}),
		);
		expect(ctx.incidentBroadcaster.broadcast).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "incident.event",
				event: expect.objectContaining({
					incidentId: incident._id,
					kind: "received",
				}),
			}),
		);
	});
});

describe("incidents.ingest — audio path", () => {
	it("decodes base64, calls transcribeAudioFile, and uses the returned transcript", async () => {
		vi.mocked(brief).mockReturnValue(new Promise(() => {}));
		const transcribed = "transcribed call from audio";
		const transcriber = makeFakeTranscriber(transcribed);
		const ctx = buildContext({ transcriber });
		const audioBytes = Buffer.from([1, 2, 3, 4, 5]);

		const incident = await call(
			incidentsRouter.ingest,
			{ audio: audioBytes.toString("base64"), mimeType: "audio/wav" },
			{ context: ctx },
		);

		expect(transcriber.transcribeAudioFile).toHaveBeenCalledTimes(1);
		const [bufferArg, mimeArg] = transcriber.transcribeAudioFile.mock.calls[0];
		expect(Buffer.isBuffer(bufferArg)).toBe(true);
		expect((bufferArg as Buffer).equals(audioBytes)).toBe(true);
		expect(mimeArg).toBe("audio/wav");

		expect(incident.transcript).toBe(transcribed);
		expect(incident.transcriptHash).toBe(
			createHash("sha256").update(transcribed).digest("hex"),
		);
	});
});

describe("incidents.ingest — input validation", () => {
	it("rejects when neither audio nor transcript is provided", async () => {
		const ctx = buildContext();
		await expect(
			call(incidentsRouter.ingest, {}, { context: ctx }),
		).rejects.toThrow();
		expect(brief).not.toHaveBeenCalled();
		expect(ctx.incidentBroadcaster.broadcast).not.toHaveBeenCalled();
	});

	it("rejects when both audio and transcript are provided", async () => {
		const ctx = buildContext();
		await expect(
			call(
				incidentsRouter.ingest,
				{
					audio: Buffer.from([1, 2]).toString("base64"),
					mimeType: "audio/wav",
					transcript: "also a transcript",
				},
				{ context: ctx },
			),
		).rejects.toThrow();
		expect(brief).not.toHaveBeenCalled();
		expect(ctx.incidentBroadcaster.broadcast).not.toHaveBeenCalled();
	});

	it("rejects when audio is provided without mimeType", async () => {
		const ctx = buildContext();
		await expect(
			call(
				incidentsRouter.ingest,
				{ audio: Buffer.from([1, 2]).toString("base64") },
				{ context: ctx },
			),
		).rejects.toThrow();
	});
});

describe("incidents.ingest — async briefing broadcast", () => {
	it("broadcasts briefing.ready after brief() resolves, with the briefing payload", async () => {
		const ctx = buildContext();

		vi.mocked(brief).mockImplementation(async (incidentId) =>
			makeFakeBriefing(incidentId),
		);

		const incident = await call(
			incidentsRouter.ingest,
			{ transcript: "broadcast test" },
			{ context: ctx },
		);

		await vi.waitFor(() => {
			expect(ctx.incidentBroadcaster.broadcast).toHaveBeenCalledWith(
				expect.objectContaining({
					type: "briefing.ready",
					incidentId: incident._id,
					briefing: expect.objectContaining({
						incidentId: incident._id,
						summary: "test briefing",
					}),
				}),
			);
		});
		expect(ctx.incidentBroadcaster.broadcast).toHaveBeenCalledTimes(3);
	});

	it("broadcasts briefing.failed when brief() rejects, and does not crash", async () => {
		const ctx = buildContext();
		vi.mocked(brief).mockRejectedValue(new Error("anthropic exploded"));

		const incident = await call(
			incidentsRouter.ingest,
			{ transcript: "failure test" },
			{ context: ctx },
		);

		await vi.waitFor(() => {
			expect(ctx.incidentBroadcaster.broadcast).toHaveBeenCalledWith(
				expect.objectContaining({
					type: "briefing.failed",
					incidentId: incident._id,
					error: "anthropic exploded",
				}),
			);
		});
	});
});

describe("incidents.list / incidents.get round-trip", () => {
	async function seedIncident(
		transcript = "seed transcript",
	): Promise<Incident> {
		const id = randomUUID();
		const transcriptHash = createHash("sha256")
			.update(transcript)
			.digest("hex");
		await IncidentModel.create({
			_id: id,
			callStartedAt: new Date(),
			transcript,
			transcriptHash,
			status: "live",
			assigned: { vehicles: [], responders: [] },
		});
		const found = await IncidentModel.findById(id).lean();
		return JSON.parse(JSON.stringify(found)) as Incident;
	}

	it("list returns the most recent incidents (newest first)", async () => {
		const older = await seedIncident("older");
		await IncidentModel.findByIdAndUpdate(older._id, {
			callStartedAt: new Date(Date.now() - 60_000),
		});
		const newer = await seedIncident("newer");

		const list = await call(incidentsRouter.list, undefined as never, {
			context: buildContext(),
		});

		expect(list.length).toBe(2);
		expect(list[0]._id).toBe(newer._id);
		expect(list[1]._id).toBe(older._id);
	});

	it("get returns the incident plus the latest briefing when one exists", async () => {
		const seeded = await seedIncident("get test");
		const briefing = makeFakeBriefing(seeded._id);
		await BriefingModel.create(briefing);

		const result = await call(
			incidentsRouter.get,
			{ id: seeded._id },
			{ context: buildContext() },
		);

		expect(result.incident._id).toBe(seeded._id);
		expect(result.briefing?._id).toBe(briefing._id);
		expect(result.briefing?.summary).toBe("test briefing");
	});

	it("get returns the incident with no briefing when the agent hasn't finished yet", async () => {
		const seeded = await seedIncident("no-briefing-yet");
		const result = await call(
			incidentsRouter.get,
			{ id: seeded._id },
			{ context: buildContext() },
		);
		expect(result.incident._id).toBe(seeded._id);
		expect(result.briefing).toBeUndefined();
	});

	it("get throws NOT_FOUND for an unknown id", async () => {
		await expect(
			call(
				incidentsRouter.get,
				{ id: "ghost-id" },
				{ context: buildContext() },
			),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});
