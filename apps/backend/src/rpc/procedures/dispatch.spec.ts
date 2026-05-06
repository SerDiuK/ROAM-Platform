import { randomUUID } from "node:crypto";
import { call } from "@orpc/server";
import type { Briefing, Dispatch, Incident } from "@roam/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	makeFakeBroadcaster,
	makeFakeLogger,
} from "../../../test/factories.js";
import { computeBriefingHash } from "../../agent/runner.js";
import type { Config } from "../../config.js";
import { BriefingModel } from "../../db/models/briefing.js";
import { DispatchModel } from "../../db/models/dispatch.js";
import { DispatchResponseModel } from "../../db/models/dispatchResponse.js";
import { IncidentModel } from "../../db/models/incident.js";
import type { ExpoPushClient } from "../../push/expo.js";
import type { RpcContext } from "../context.js";
import { dispatchRouter } from "./dispatch.js";

function makeFakePushClient(): {
	sendPushToResponders: ReturnType<typeof vi.fn>;
} {
	return {
		sendPushToResponders: vi.fn(async () => ({
			tickets: [],
			delivered: 0,
			skipped: 0,
		})),
	};
}

const fakeConfig = {} as Config;

interface ContextOverrides {
	dispatchBroadcaster?: ReturnType<typeof makeFakeBroadcaster>;
	pushClient?: ReturnType<typeof makeFakePushClient>;
}

function buildContext(overrides: ContextOverrides = {}): RpcContext & {
	dispatchBroadcaster: ReturnType<typeof makeFakeBroadcaster>;
	pushClient: ReturnType<typeof makeFakePushClient>;
} {
	const dispatchBroadcaster =
		overrides.dispatchBroadcaster ?? makeFakeBroadcaster();
	const pushClient = overrides.pushClient ?? makeFakePushClient();
	return {
		config: fakeConfig,
		incidentBroadcaster:
			makeFakeBroadcaster() as unknown as RpcContext["incidentBroadcaster"],
		dispatchBroadcaster:
			dispatchBroadcaster as unknown as RpcContext["dispatchBroadcaster"],
		walletProvider: {} as RpcContext["walletProvider"],
		transcriber: {} as RpcContext["transcriber"],
		anthropic: {} as RpcContext["anthropic"],
		pushClient: pushClient as unknown as ExpoPushClient,
		log: makeFakeLogger() as unknown as RpcContext["log"],
		user: null,
	} as RpcContext & {
		dispatchBroadcaster: ReturnType<typeof makeFakeBroadcaster>;
		pushClient: ReturnType<typeof makeFakePushClient>;
	};
}

interface SeededBriefing {
	incident: Incident;
	briefing: Briefing;
}

async function seedBriefing(
	overrides: {
		recommendedVehicleIds?: string[];
		recommendedResponderIds?: string[];
		summary?: string;
		incidentType?: string;
		totalUsdc?: number;
	} = {},
): Promise<SeededBriefing> {
	const incidentId = randomUUID();
	const briefingId = randomUUID();
	const summary = overrides.summary ?? "two-car crash, injuries reported";
	const recommendedVehicleIds =
		overrides.recommendedVehicleIds ?? ["vehicle-1", "vehicle-2"];
	const recommendedResponderIds =
		overrides.recommendedResponderIds ?? ["responder-1", "responder-2"];
	const totalUsdc = overrides.totalUsdc ?? 25;
	const payout = {
		baseUsdc: 10,
		urgencyMultiplier: 2,
		hazmatMultiplier: 1,
		distanceMultiplier: 1.25,
		totalUsdc,
	};
	const briefingHash = computeBriefingHash({
		summary,
		recommendedVehicleIds,
		recommendedResponderIds,
		payout,
	});

	await IncidentModel.create({
		_id: incidentId,
		callStartedAt: new Date(),
		transcript: "raw 911 transcript",
		transcriptHash: "transcript-hash",
		classification: {
			incidentType: overrides.incidentType ?? "MVA",
			urgency: 1,
			locationDescription: "Biscayne & 36th",
			requiredCapabilities: ["medic"],
		},
		status: "live",
		assigned: { vehicles: [], responders: [] },
	});

	await BriefingModel.create({
		_id: briefingId,
		incidentId,
		generatedAt: new Date(),
		generatedByModel: "claude-sonnet-4-6",
		summary,
		recommendedVehicleIds,
		recommendedResponderIds,
		payout,
		briefingHash,
	});

	const incident = JSON.parse(
		JSON.stringify(await IncidentModel.findById(incidentId).lean()),
	) as Incident;
	const briefing = JSON.parse(
		JSON.stringify(await BriefingModel.findById(briefingId).lean()),
	) as Briefing;
	return { incident, briefing };
}

async function seedPendingDispatch(args: {
	briefingId: string;
	incidentId: string;
	responderIds: string[];
	requiredAccepts?: number;
	expiresInSecs?: number;
	payoutUsdc?: number;
}): Promise<Dispatch> {
	const dispatchId = randomUUID();
	const now = new Date();
	const expiresAt = new Date(
		now.getTime() + (args.expiresInSecs ?? 60) * 1000,
	);
	await DispatchModel.create({
		_id: dispatchId,
		incidentId: args.incidentId,
		briefingId: args.briefingId,
		decisionMaker: "human",
		decidedAt: now,
		assignedVehicleIds: ["vehicle-1"],
		assignedResponderIds: args.responderIds,
		payoutUsdc: args.payoutUsdc ?? 25,
		requiredAccepts: args.requiredAccepts ?? 1,
		status: "pending",
		claimedByResponderIds: [],
		expiresAt,
	});
	return JSON.parse(
		JSON.stringify(await DispatchModel.findById(dispatchId).lean()),
	) as Dispatch;
}

describe("dispatch.confirm", () => {
	it("creates a Dispatch, flips Incident to responding, fires push, broadcasts dispatch.created", async () => {
		const { incident, briefing } = await seedBriefing({
			incidentType: "Cardiac arrest",
			recommendedResponderIds: ["responder-A", "responder-B"],
			totalUsdc: 42,
		});
		const ctx = buildContext();

		const dispatch = await call(
			dispatchRouter.confirm,
			{
				briefingId: briefing._id,
				decisionMaker: "human",
				decidedBy: "dispatcher-1",
			},
			{ context: ctx },
		);

		expect(dispatch.status).toBe("pending");
		expect(dispatch.incidentId).toBe(incident._id);
		expect(dispatch.briefingId).toBe(briefing._id);
		expect(dispatch.assignedVehicleIds).toEqual(briefing.recommendedVehicleIds);
		expect(dispatch.assignedResponderIds).toEqual([
			"responder-A",
			"responder-B",
		]);
		expect(dispatch.payoutUsdc).toBe(42);
		expect(dispatch.requiredAccepts).toBe(1);
		expect(dispatch.claimedByResponderIds).toEqual([]);

		// Default expiry is 60s in the future.
		const expiresAt = new Date(dispatch.expiresAt).getTime();
		expect(expiresAt - Date.now()).toBeGreaterThan(50_000);
		expect(expiresAt - Date.now()).toBeLessThan(70_000);

		const updatedIncident = await IncidentModel.findById(incident._id).lean();
		expect(updatedIncident?.status).toBe("responding");
		expect(updatedIncident?.dispatchedAt).toBeInstanceOf(Date);

		expect(ctx.pushClient.sendPushToResponders).toHaveBeenCalledTimes(1);
		expect(ctx.pushClient.sendPushToResponders).toHaveBeenCalledWith(
			["responder-A", "responder-B"],
			expect.objectContaining({
				title: "Cardiac arrest",
				body: briefing.summary,
				data: expect.objectContaining({
					type: "dispatch.created",
					dispatchId: dispatch._id,
					payoutUsdc: 42,
				}),
			}),
		);

		expect(ctx.dispatchBroadcaster.broadcast).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "dispatch.created",
				dispatch: expect.objectContaining({ _id: dispatch._id }),
			}),
		);
	});

	it("falls back to a generic title when the incident has no classification", async () => {
		const { incident, briefing } = await seedBriefing();
		// Strip classification — simulates an incident that hasn't been
		// classified yet (shouldn't happen in practice but the handler must
		// not crash on it).
		await IncidentModel.findByIdAndUpdate(incident._id, {
			$unset: { classification: 1 },
		});
		const ctx = buildContext();

		await call(
			dispatchRouter.confirm,
			{ briefingId: briefing._id, decisionMaker: "ai-auto" },
			{ context: ctx },
		);

		expect(ctx.pushClient.sendPushToResponders).toHaveBeenCalledWith(
			expect.any(Array),
			expect.objectContaining({ title: "Dispatch" }),
		);
	});

	it("rejects when briefingHash mismatches the re-canonicalized payload", async () => {
		const { briefing } = await seedBriefing();
		// Tamper with the persisted summary AFTER the hash was computed —
		// this is exactly what a stale or compromised briefing would look like.
		await BriefingModel.findByIdAndUpdate(briefing._id, {
			summary: "ALTERED — different incident",
		});
		const ctx = buildContext();

		await expect(
			call(
				dispatchRouter.confirm,
				{ briefingId: briefing._id, decisionMaker: "human" },
				{ context: ctx },
			),
		).rejects.toMatchObject({ code: "CONFLICT" });

		expect(ctx.pushClient.sendPushToResponders).not.toHaveBeenCalled();
		expect(ctx.dispatchBroadcaster.broadcast).not.toHaveBeenCalled();
		expect(await DispatchModel.countDocuments()).toBe(0);
	});

	it("returns NOT_FOUND when the briefing doesn't exist", async () => {
		const ctx = buildContext();
		await expect(
			call(
				dispatchRouter.confirm,
				{ briefingId: "ghost-briefing", decisionMaker: "human" },
				{ context: ctx },
			),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});

describe("dispatch.respond — accept", () => {
	it("persists the response, pushes responderId onto claimedByResponderIds, and flips status='claimed' when full", async () => {
		const { briefing } = await seedBriefing();
		const dispatch = await seedPendingDispatch({
			briefingId: briefing._id,
			incidentId: briefing.incidentId,
			responderIds: ["responder-A", "responder-B"],
			requiredAccepts: 1,
		});
		const ctx = buildContext();

		const result = await call(
			dispatchRouter.respond,
			{
				dispatchId: dispatch._id,
				responderId: "responder-A",
				decision: "accept",
			},
			{ context: ctx },
		);

		expect(result.dispatch.status).toBe("claimed");
		expect(result.dispatch.claimedByResponderIds).toEqual(["responder-A"]);
		expect(result.response.decision).toBe("accept");
		expect(result.response.responderId).toBe("responder-A");

		const responses = await DispatchResponseModel.find({
			dispatchId: dispatch._id,
		}).lean();
		expect(responses).toHaveLength(1);
		expect(responses[0]?.decision).toBe("accept");

		expect(ctx.dispatchBroadcaster.broadcast).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "dispatch.responded",
				dispatchId: dispatch._id,
				response: expect.objectContaining({ decision: "accept" }),
				dispatch: expect.objectContaining({ status: "claimed" }),
			}),
		);
	});

	it("stays pending when more accepts are still required", async () => {
		const { briefing } = await seedBriefing();
		const dispatch = await seedPendingDispatch({
			briefingId: briefing._id,
			incidentId: briefing.incidentId,
			responderIds: ["responder-A", "responder-B"],
			requiredAccepts: 2,
		});
		const ctx = buildContext();

		const result = await call(
			dispatchRouter.respond,
			{
				dispatchId: dispatch._id,
				responderId: "responder-A",
				decision: "accept",
			},
			{ context: ctx },
		);

		expect(result.dispatch.status).toBe("pending");
		expect(result.dispatch.claimedByResponderIds).toEqual(["responder-A"]);
	});

	it("first-to-claim race: only one of two parallel accepts wins, the other gets CONFLICT", async () => {
		const { briefing } = await seedBriefing();
		const dispatch = await seedPendingDispatch({
			briefingId: briefing._id,
			incidentId: briefing.incidentId,
			responderIds: ["responder-A", "responder-B"],
			requiredAccepts: 1,
		});
		const ctx = buildContext();

		const results = await Promise.allSettled([
			call(
				dispatchRouter.respond,
				{
					dispatchId: dispatch._id,
					responderId: "responder-A",
					decision: "accept",
				},
				{ context: ctx },
			),
			call(
				dispatchRouter.respond,
				{
					dispatchId: dispatch._id,
					responderId: "responder-B",
					decision: "accept",
				},
				{ context: ctx },
			),
		]);

		const fulfilled = results.filter((r) => r.status === "fulfilled");
		const rejected = results.filter((r) => r.status === "rejected");
		expect(fulfilled).toHaveLength(1);
		expect(rejected).toHaveLength(1);
		expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
			code: "CONFLICT",
			message: "dispatch_already_claimed",
		});

		const after = await DispatchModel.findById(dispatch._id).lean();
		expect(after?.status).toBe("claimed");
		expect(after?.claimedByResponderIds).toHaveLength(1);

		// Only the winner persisted a response — the rejected accept never
		// reached the response insert (atomic claim filter rejected first).
		const responses = await DispatchResponseModel.find({
			dispatchId: dispatch._id,
		}).lean();
		expect(responses).toHaveLength(1);
		expect(responses[0]?.decision).toBe("accept");
	});

	it("rejects accept on an expired dispatch", async () => {
		const { briefing } = await seedBriefing();
		const dispatch = await seedPendingDispatch({
			briefingId: briefing._id,
			incidentId: briefing.incidentId,
			responderIds: ["responder-A"],
			requiredAccepts: 1,
		});
		// Backdate expiry to make it stale.
		await DispatchModel.findByIdAndUpdate(dispatch._id, {
			expiresAt: new Date(Date.now() - 1000),
		});
		const ctx = buildContext();

		await expect(
			call(
				dispatchRouter.respond,
				{
					dispatchId: dispatch._id,
					responderId: "responder-A",
					decision: "accept",
				},
				{ context: ctx },
			),
		).rejects.toMatchObject({ code: "CONFLICT" });

		const after = await DispatchModel.findById(dispatch._id).lean();
		expect(after?.claimedByResponderIds).toEqual([]);
		expect(await DispatchResponseModel.countDocuments()).toBe(0);
	});
});

describe("dispatch.respond — decline", () => {
	it("records the decline without modifying the dispatch", async () => {
		const { briefing } = await seedBriefing();
		const dispatch = await seedPendingDispatch({
			briefingId: briefing._id,
			incidentId: briefing.incidentId,
			responderIds: ["responder-A"],
			requiredAccepts: 1,
		});
		const ctx = buildContext();

		const result = await call(
			dispatchRouter.respond,
			{
				dispatchId: dispatch._id,
				responderId: "responder-A",
				decision: "decline",
				declineReason: "off-shift",
			},
			{ context: ctx },
		);

		expect(result.dispatch.status).toBe("pending");
		expect(result.dispatch.claimedByResponderIds).toEqual([]);
		expect(result.response.decision).toBe("decline");
		expect(result.response.declineReason).toBe("off-shift");
	});

	it("records a decline even on an expired dispatch", async () => {
		const { briefing } = await seedBriefing();
		const dispatch = await seedPendingDispatch({
			briefingId: briefing._id,
			incidentId: briefing.incidentId,
			responderIds: ["responder-A"],
			requiredAccepts: 1,
		});
		await DispatchModel.findByIdAndUpdate(dispatch._id, {
			expiresAt: new Date(Date.now() - 1000),
		});
		const ctx = buildContext();

		const result = await call(
			dispatchRouter.respond,
			{
				dispatchId: dispatch._id,
				responderId: "responder-A",
				decision: "decline",
				declineReason: "too far",
			},
			{ context: ctx },
		);

		expect(result.response.decision).toBe("decline");
		expect(await DispatchResponseModel.countDocuments()).toBe(1);
	});
});

describe("dispatch.respond — duplicate response", () => {
	it("rejects a second response from the same responder with CONFLICT", async () => {
		const { briefing } = await seedBriefing();
		const dispatch = await seedPendingDispatch({
			briefingId: briefing._id,
			incidentId: briefing.incidentId,
			responderIds: ["responder-A"],
			requiredAccepts: 2,
		});
		const ctx = buildContext();

		await call(
			dispatchRouter.respond,
			{
				dispatchId: dispatch._id,
				responderId: "responder-A",
				decision: "decline",
			},
			{ context: ctx },
		);

		await expect(
			call(
				dispatchRouter.respond,
				{
					dispatchId: dispatch._id,
					responderId: "responder-A",
					decision: "accept",
				},
				{ context: ctx },
			),
		).rejects.toMatchObject({ code: "CONFLICT" });

		// The roll-back must keep the dispatch consistent — responder-A
		// declined, so they shouldn't appear in claimedByResponderIds.
		const after = await DispatchModel.findById(dispatch._id).lean();
		expect(after?.claimedByResponderIds).toEqual([]);
		expect(await DispatchResponseModel.countDocuments()).toBe(1);
	});
});

describe("dispatch.list / dispatch.get", () => {
	it("list returns only active (pending or claimed) dispatches, newest first", async () => {
		const { briefing } = await seedBriefing();

		const older = await seedPendingDispatch({
			briefingId: briefing._id,
			incidentId: briefing.incidentId,
			responderIds: ["responder-A"],
		});
		await DispatchModel.findByIdAndUpdate(older._id, {
			decidedAt: new Date(Date.now() - 60_000),
		});

		const newer = await seedPendingDispatch({
			briefingId: briefing._id,
			incidentId: briefing.incidentId,
			responderIds: ["responder-B"],
		});

		// A cancelled dispatch shouldn't show up in the active list.
		const cancelled = await seedPendingDispatch({
			briefingId: briefing._id,
			incidentId: briefing.incidentId,
			responderIds: ["responder-C"],
		});
		await DispatchModel.findByIdAndUpdate(cancelled._id, {
			status: "cancelled",
		});

		const list = await call(
			dispatchRouter.list,
			undefined as never,
			{ context: buildContext() },
		);

		expect(list).toHaveLength(2);
		expect(list[0]?._id).toBe(newer._id);
		expect(list[1]?._id).toBe(older._id);
	});

	it("get returns the dispatch plus its responses, ordered by respondedAt", async () => {
		const { briefing } = await seedBriefing();
		const dispatch = await seedPendingDispatch({
			briefingId: briefing._id,
			incidentId: briefing.incidentId,
			responderIds: ["responder-A", "responder-B"],
			requiredAccepts: 2,
		});
		const ctx = buildContext();

		await call(
			dispatchRouter.respond,
			{
				dispatchId: dispatch._id,
				responderId: "responder-A",
				decision: "decline",
			},
			{ context: ctx },
		);
		await call(
			dispatchRouter.respond,
			{
				dispatchId: dispatch._id,
				responderId: "responder-B",
				decision: "accept",
			},
			{ context: ctx },
		);

		const result = await call(
			dispatchRouter.get,
			{ id: dispatch._id },
			{ context: ctx },
		);

		expect(result.dispatch._id).toBe(dispatch._id);
		expect(result.responses).toHaveLength(2);
		expect(result.responses[0]?.responderId).toBe("responder-A");
		expect(result.responses[1]?.responderId).toBe("responder-B");
	});

	it("get throws NOT_FOUND for an unknown dispatch", async () => {
		await expect(
			call(
				dispatchRouter.get,
				{ id: "ghost-dispatch" },
				{ context: buildContext() },
			),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});

describe("dispatch.clear", () => {
	it("flips a claimed dispatch to cleared and resolves the incident", async () => {
		const { incident, briefing } = await seedBriefing();
		const dispatch = await seedPendingDispatch({
			briefingId: briefing._id,
			incidentId: briefing.incidentId,
			responderIds: ["responder-A"],
			requiredAccepts: 1,
		});
		const ctx = buildContext();

		await call(
			dispatchRouter.respond,
			{
				dispatchId: dispatch._id,
				responderId: "responder-A",
				decision: "accept",
			},
			{ context: ctx },
		);

		const cleared = await call(
			dispatchRouter.clear,
			{ dispatchId: dispatch._id, clearedBy: "responder-A" },
			{ context: ctx },
		);

		expect(cleared.status).toBe("cleared");

		const updatedIncident = await IncidentModel.findById(incident._id).lean();
		expect(updatedIncident?.status).toBe("resolved");
		expect(updatedIncident?.clearedAt).toBeInstanceOf(Date);

		expect(ctx.dispatchBroadcaster.broadcast).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "dispatch.cleared",
				dispatch: expect.objectContaining({
					_id: dispatch._id,
					status: "cleared",
				}),
				clearedBy: "responder-A",
			}),
		);
	});

	it("rejects clear on a pending dispatch", async () => {
		const { briefing } = await seedBriefing();
		const dispatch = await seedPendingDispatch({
			briefingId: briefing._id,
			incidentId: briefing.incidentId,
			responderIds: ["responder-A"],
			requiredAccepts: 1,
		});

		await expect(
			call(
				dispatchRouter.clear,
				{ dispatchId: dispatch._id },
				{ context: buildContext() },
			),
		).rejects.toMatchObject({ code: "CONFLICT" });

		// Dispatch unchanged.
		const unchanged = await DispatchModel.findById(dispatch._id).lean();
		expect(unchanged?.status).toBe("pending");
	});

	it("is not idempotent — clearing an already-cleared dispatch returns CONFLICT", async () => {
		const { briefing } = await seedBriefing();
		const dispatch = await seedPendingDispatch({
			briefingId: briefing._id,
			incidentId: briefing.incidentId,
			responderIds: ["responder-A"],
			requiredAccepts: 1,
		});
		const ctx = buildContext();

		await call(
			dispatchRouter.respond,
			{
				dispatchId: dispatch._id,
				responderId: "responder-A",
				decision: "accept",
			},
			{ context: ctx },
		);
		await call(
			dispatchRouter.clear,
			{ dispatchId: dispatch._id },
			{ context: ctx },
		);

		await expect(
			call(
				dispatchRouter.clear,
				{ dispatchId: dispatch._id },
				{ context: ctx },
			),
		).rejects.toMatchObject({ code: "CONFLICT" });
	});

	it("returns NOT_FOUND for an unknown dispatch", async () => {
		await expect(
			call(
				dispatchRouter.clear,
				{ dispatchId: "ghost-dispatch" },
				{ context: buildContext() },
			),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("removes cleared dispatches from the active list", async () => {
		const { briefing } = await seedBriefing();
		const dispatch = await seedPendingDispatch({
			briefingId: briefing._id,
			incidentId: briefing.incidentId,
			responderIds: ["responder-A"],
			requiredAccepts: 1,
		});
		const ctx = buildContext();

		await call(
			dispatchRouter.respond,
			{
				dispatchId: dispatch._id,
				responderId: "responder-A",
				decision: "accept",
			},
			{ context: ctx },
		);
		await call(
			dispatchRouter.clear,
			{ dispatchId: dispatch._id },
			{ context: ctx },
		);

		const list = await call(
			dispatchRouter.list,
			undefined as never,
			{ context: ctx },
		);
		expect(list.find((d) => d._id === dispatch._id)).toBeUndefined();
	});
});

describe("dispatch lifecycle smoke", () => {
	beforeEach(() => {
		vi.useRealTimers();
	});

	it("end-to-end: confirm → accept → push fired → dispatch claimed", async () => {
		const { briefing } = await seedBriefing({
			recommendedResponderIds: ["responder-A", "responder-B"],
		});
		const ctx = buildContext();

		const dispatch = await call(
			dispatchRouter.confirm,
			{ briefingId: briefing._id, decisionMaker: "human" },
			{ context: ctx },
		);

		const accepted = await call(
			dispatchRouter.respond,
			{
				dispatchId: dispatch._id,
				responderId: "responder-A",
				decision: "accept",
			},
			{ context: ctx },
		);

		expect(accepted.dispatch.status).toBe("claimed");
		expect(accepted.dispatch.claimedByResponderIds).toEqual(["responder-A"]);

		expect(ctx.pushClient.sendPushToResponders).toHaveBeenCalledTimes(1);
		// Two broadcasts: dispatch.created + dispatch.responded.
		expect(ctx.dispatchBroadcaster.broadcast).toHaveBeenCalledTimes(2);
	});
});
