import { randomUUID } from "node:crypto";
import { call } from "@orpc/server";
import type { Briefing, Dispatch, Incident } from "@roam/shared";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import bs58 from "bs58";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	makeFakeBroadcaster,
	makeFakeLogger,
	makeResponder,
} from "../../../test/factories.js";
import { computeBriefingHash } from "../../agent/runner.js";
import type { Config } from "../../config.js";
import { BriefingModel } from "../../db/models/briefing.js";
import { DispatchModel } from "../../db/models/dispatch.js";
import { DispatchResponseModel } from "../../db/models/dispatchResponse.js";
import { IncidentModel } from "../../db/models/incident.js";
import { ResponderModel } from "../../db/models/responder.js";
import type { ExpoPushClient } from "../../push/expo.js";
import type { AuthedUser, RpcContext } from "../context.js";
import { dispatchRouter } from "./dispatch.js";

vi.mock("@roam/solana-client", async () => {
	const actual = await vi.importActual<typeof import("@roam/solana-client")>(
		"@roam/solana-client",
	);
	return {
		...actual,
		buildRecordEventTx: vi.fn(),
		partialSignAsFeePayer: vi.fn(),
	};
});

vi.mock("../../x402/client.js", () => ({
	triggerX402Payment: vi.fn(async () => "fake-x402-sig"),
	SETTLEMENT_SOL: 0.001,
}));

const { buildRecordEventTx, partialSignAsFeePayer } = await import(
	"@roam/solana-client"
);
const buildRecordEventTxMock = vi.mocked(buildRecordEventTx);
const partialSignAsFeePayerMock = vi.mocked(partialSignAsFeePayer);

const { triggerX402Payment } = await import("../../x402/client.js");
const triggerX402PaymentMock = vi.mocked(triggerX402Payment);

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

const TEST_HMAC_KEY = "0".repeat(64);
const TEST_OPERATOR = Keypair.generate();

const fakeConfig = {
	SOLANA_OPERATOR_KEYPAIR: bs58.encode(TEST_OPERATOR.secretKey),
	SOLANA_CLUSTER: "devnet",
	CHAIN_HMAC_KEY: TEST_HMAC_KEY,
} as Config;

interface ContextOverrides {
	dispatchBroadcaster?: ReturnType<typeof makeFakeBroadcaster>;
	pushClient?: ReturnType<typeof makeFakePushClient>;
	user?: AuthedUser | null;
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
		user: overrides.user ?? null,
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
	const recommendedVehicleIds = overrides.recommendedVehicleIds ?? [
		"vehicle-1",
		"vehicle-2",
	];
	const recommendedResponderIds = overrides.recommendedResponderIds ?? [
		"responder-1",
		"responder-2",
	];
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
	const expiresAt = new Date(now.getTime() + (args.expiresInSecs ?? 60) * 1000);
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

async function seedSiwsResponder(idOverride?: string): Promise<{
	id: string;
	pubkey: string;
	user: AuthedUser;
}> {
	const id = idOverride ?? randomUUID();
	const seekerKp = Keypair.generate();
	const pubkey = seekerKp.publicKey.toBase58();
	const op = await makeResponder({ name: `RSP-${id.slice(0, 4)}` });
	await ResponderModel.findByIdAndUpdate(op._id, { walletAddress: pubkey });
	return {
		id: op._id,
		pubkey,
		user: { id: op._id, name: op.name, role: "responder" },
	};
}

async function commitFor(args: {
	user: AuthedUser;
	dispatchId: string;
	decision: "accept" | "decline";
	declineReason?: string;
	signature?: string;
}): Promise<void> {
	await call(
		dispatchRouter.commitSignedResponse,
		{
			dispatchId: args.dispatchId,
			decision: args.decision,
			declineReason: args.declineReason,
			signature: args.signature ?? `sig-${randomUUID()}`,
		},
		{ context: buildContext({ user: args.user }) },
	);
}

beforeEach(() => {
	buildRecordEventTxMock.mockReset();
	partialSignAsFeePayerMock.mockReset();
	triggerX402PaymentMock.mockReset();
	buildRecordEventTxMock.mockImplementation(async (args) => {
		const tx = new Transaction({
			feePayer: args.feePayerPubkey,
			recentBlockhash: "11111111111111111111111111111111",
		});
		return { transaction: tx, eventPda: PublicKey.default };
	});
	partialSignAsFeePayerMock.mockImplementation(() => {});
	triggerX402PaymentMock.mockResolvedValue("fake-x402-sig");
});

async function flushMicrotasks(): Promise<void> {
	await new Promise((resolve) => setImmediate(resolve));
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

describe("dispatch.prepareResponseTx", () => {
	it("builds a partially-signed tx with attestor = responder.walletAddress and fee_payer = operator", async () => {
		const { briefing } = await seedBriefing();
		const seeker = await seedSiwsResponder();
		const dispatch = await seedPendingDispatch({
			briefingId: briefing._id,
			incidentId: briefing.incidentId,
			responderIds: [seeker.id],
			requiredAccepts: 1,
		});

		const result = await call(
			dispatchRouter.prepareResponseTx,
			{ dispatchId: dispatch._id, decision: "accept" },
			{ context: buildContext({ user: seeker.user }) },
		);

		expect(buildRecordEventTxMock).toHaveBeenCalledTimes(1);
		const args = buildRecordEventTxMock.mock.calls[0]?.[0];
		expect(args?.kind).toBe("accepted");
		expect(args?.attestorPubkey.toBase58()).toBe(seeker.pubkey);
		expect(args?.feePayerPubkey.toBase58()).toBe(
			TEST_OPERATOR.publicKey.toBase58(),
		);
		expect(partialSignAsFeePayerMock).toHaveBeenCalledTimes(1);

		expect(typeof result.serializedTx).toBe("string");
		expect(result.serializedTx.length).toBeGreaterThan(0);
		expect(typeof result.expiresAt).toBe("string");
	});

	it("uses kind=rejected for decline", async () => {
		const { briefing } = await seedBriefing();
		const seeker = await seedSiwsResponder();
		const dispatch = await seedPendingDispatch({
			briefingId: briefing._id,
			incidentId: briefing.incidentId,
			responderIds: [seeker.id],
		});

		await call(
			dispatchRouter.prepareResponseTx,
			{
				dispatchId: dispatch._id,
				decision: "decline",
				declineReason: "off-shift",
			},
			{ context: buildContext({ user: seeker.user }) },
		);

		expect(buildRecordEventTxMock.mock.calls[0]?.[0].kind).toBe("rejected");
	});

	it("rejects accept when the dispatch is already claimed (no fingerprint prompt)", async () => {
		const { briefing } = await seedBriefing();
		const seeker = await seedSiwsResponder();
		const dispatch = await seedPendingDispatch({
			briefingId: briefing._id,
			incidentId: briefing.incidentId,
			responderIds: [seeker.id],
			requiredAccepts: 1,
		});
		await DispatchModel.findByIdAndUpdate(dispatch._id, { status: "claimed" });

		await expect(
			call(
				dispatchRouter.prepareResponseTx,
				{ dispatchId: dispatch._id, decision: "accept" },
				{ context: buildContext({ user: seeker.user }) },
			),
		).rejects.toMatchObject({
			code: "CONFLICT",
			message: "dispatch_already_claimed",
		});

		expect(buildRecordEventTxMock).not.toHaveBeenCalled();
	});

	it("rejects when the responder has no walletAddress bound", async () => {
		const { briefing } = await seedBriefing();
		const op = await makeResponder({ name: "UNBOUND-1" });
		const dispatch = await seedPendingDispatch({
			briefingId: briefing._id,
			incidentId: briefing.incidentId,
			responderIds: [op._id],
		});

		await expect(
			call(
				dispatchRouter.prepareResponseTx,
				{ dispatchId: dispatch._id, decision: "accept" },
				{
					context: buildContext({
						user: { id: op._id, name: op.name, role: "responder" },
					}),
				},
			),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});

	it("decline still proceeds on an expired dispatch (audit-trail value)", async () => {
		const { briefing } = await seedBriefing();
		const seeker = await seedSiwsResponder();
		const dispatch = await seedPendingDispatch({
			briefingId: briefing._id,
			incidentId: briefing.incidentId,
			responderIds: [seeker.id],
		});
		await DispatchModel.findByIdAndUpdate(dispatch._id, {
			expiresAt: new Date(Date.now() - 1000),
		});

		await call(
			dispatchRouter.prepareResponseTx,
			{ dispatchId: dispatch._id, decision: "decline", declineReason: "late" },
			{ context: buildContext({ user: seeker.user }) },
		);
		expect(buildRecordEventTxMock).toHaveBeenCalledTimes(1);
	});

	it("rejects accept on an expired dispatch", async () => {
		const { briefing } = await seedBriefing();
		const seeker = await seedSiwsResponder();
		const dispatch = await seedPendingDispatch({
			briefingId: briefing._id,
			incidentId: briefing.incidentId,
			responderIds: [seeker.id],
		});
		await DispatchModel.findByIdAndUpdate(dispatch._id, {
			expiresAt: new Date(Date.now() - 1000),
		});

		await expect(
			call(
				dispatchRouter.prepareResponseTx,
				{ dispatchId: dispatch._id, decision: "accept" },
				{ context: buildContext({ user: seeker.user }) },
			),
		).rejects.toMatchObject({ code: "CONFLICT" });
	});
});

describe("dispatch.commitSignedResponse — accept", () => {
	it("persists the response with attestorPubkey + signature and flips status='claimed' when full", async () => {
		const { briefing } = await seedBriefing();
		const seekerA = await seedSiwsResponder();
		const seekerB = await seedSiwsResponder();
		const dispatch = await seedPendingDispatch({
			briefingId: briefing._id,
			incidentId: briefing.incidentId,
			responderIds: [seekerA.id, seekerB.id],
			requiredAccepts: 1,
		});
		const ctx = buildContext({ user: seekerA.user });

		const result = await call(
			dispatchRouter.commitSignedResponse,
			{
				dispatchId: dispatch._id,
				decision: "accept",
				signature: "sig-A-1",
			},
			{ context: ctx },
		);

		expect(result.dispatch.status).toBe("claimed");
		expect(result.dispatch.claimedByResponderIds).toEqual([seekerA.id]);
		expect(result.response.decision).toBe("accept");
		expect(result.response.responderId).toBe(seekerA.id);
		expect(result.response.solanaTxSignature).toBe("sig-A-1");
		expect(result.response.attestorPubkey).toBe(seekerA.pubkey);

		expect(ctx.dispatchBroadcaster.broadcast).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "dispatch.responded.signed",
				dispatchId: dispatch._id,
				response: expect.objectContaining({
					decision: "accept",
					solanaTxSignature: "sig-A-1",
				}),
				dispatch: expect.objectContaining({ status: "claimed" }),
			}),
		);
	});

	it("stays pending when more accepts are still required", async () => {
		const { briefing } = await seedBriefing();
		const seekerA = await seedSiwsResponder();
		const seekerB = await seedSiwsResponder();
		const dispatch = await seedPendingDispatch({
			briefingId: briefing._id,
			incidentId: briefing.incidentId,
			responderIds: [seekerA.id, seekerB.id],
			requiredAccepts: 2,
		});

		const result = await call(
			dispatchRouter.commitSignedResponse,
			{
				dispatchId: dispatch._id,
				decision: "accept",
				signature: "sig-A-2",
			},
			{ context: buildContext({ user: seekerA.user }) },
		);

		expect(result.dispatch.status).toBe("pending");
		expect(result.dispatch.claimedByResponderIds).toEqual([seekerA.id]);
	});

	it("first-to-claim race: only one of two parallel accepts wins, the other gets CONFLICT", async () => {
		const { briefing } = await seedBriefing();
		const seekerA = await seedSiwsResponder();
		const seekerB = await seedSiwsResponder();
		const dispatch = await seedPendingDispatch({
			briefingId: briefing._id,
			incidentId: briefing.incidentId,
			responderIds: [seekerA.id, seekerB.id],
			requiredAccepts: 1,
		});

		const results = await Promise.allSettled([
			call(
				dispatchRouter.commitSignedResponse,
				{ dispatchId: dispatch._id, decision: "accept", signature: "sig-A" },
				{ context: buildContext({ user: seekerA.user }) },
			),
			call(
				dispatchRouter.commitSignedResponse,
				{ dispatchId: dispatch._id, decision: "accept", signature: "sig-B" },
				{ context: buildContext({ user: seekerB.user }) },
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

		const responses = await DispatchResponseModel.find({
			dispatchId: dispatch._id,
		}).lean();
		expect(responses).toHaveLength(1);
		expect(responses[0]?.decision).toBe("accept");
	});

	it("rejects accept on an expired dispatch", async () => {
		const { briefing } = await seedBriefing();
		const seeker = await seedSiwsResponder();
		const dispatch = await seedPendingDispatch({
			briefingId: briefing._id,
			incidentId: briefing.incidentId,
			responderIds: [seeker.id],
			requiredAccepts: 1,
		});
		await DispatchModel.findByIdAndUpdate(dispatch._id, {
			expiresAt: new Date(Date.now() - 1000),
		});

		await expect(
			call(
				dispatchRouter.commitSignedResponse,
				{ dispatchId: dispatch._id, decision: "accept", signature: "sig-late" },
				{ context: buildContext({ user: seeker.user }) },
			),
		).rejects.toMatchObject({ code: "CONFLICT" });

		const after = await DispatchModel.findById(dispatch._id).lean();
		expect(after?.claimedByResponderIds).toEqual([]);
		expect(await DispatchResponseModel.countDocuments()).toBe(0);
	});
});

describe("dispatch.commitSignedResponse — decline", () => {
	it("records the decline without modifying the dispatch", async () => {
		const { briefing } = await seedBriefing();
		const seeker = await seedSiwsResponder();
		const dispatch = await seedPendingDispatch({
			briefingId: briefing._id,
			incidentId: briefing.incidentId,
			responderIds: [seeker.id],
			requiredAccepts: 1,
		});

		const result = await call(
			dispatchRouter.commitSignedResponse,
			{
				dispatchId: dispatch._id,
				decision: "decline",
				declineReason: "off-shift",
				signature: "sig-decline",
			},
			{ context: buildContext({ user: seeker.user }) },
		);

		expect(result.dispatch.status).toBe("pending");
		expect(result.dispatch.claimedByResponderIds).toEqual([]);
		expect(result.response.decision).toBe("decline");
		expect(result.response.declineReason).toBe("off-shift");
		expect(result.response.solanaTxSignature).toBe("sig-decline");
	});

	it("records a decline even on an expired dispatch", async () => {
		const { briefing } = await seedBriefing();
		const seeker = await seedSiwsResponder();
		const dispatch = await seedPendingDispatch({
			briefingId: briefing._id,
			incidentId: briefing.incidentId,
			responderIds: [seeker.id],
			requiredAccepts: 1,
		});
		await DispatchModel.findByIdAndUpdate(dispatch._id, {
			expiresAt: new Date(Date.now() - 1000),
		});

		const result = await call(
			dispatchRouter.commitSignedResponse,
			{
				dispatchId: dispatch._id,
				decision: "decline",
				declineReason: "too far",
				signature: "sig-late-decline",
			},
			{ context: buildContext({ user: seeker.user }) },
		);

		expect(result.response.decision).toBe("decline");
		expect(await DispatchResponseModel.countDocuments()).toBe(1);
	});
});

describe("dispatch.commitSignedResponse — duplicate response", () => {
	it("rejects a second response from the same responder with CONFLICT", async () => {
		const { briefing } = await seedBriefing();
		const seeker = await seedSiwsResponder();
		const dispatch = await seedPendingDispatch({
			briefingId: briefing._id,
			incidentId: briefing.incidentId,
			responderIds: [seeker.id],
			requiredAccepts: 2,
		});

		await commitFor({
			user: seeker.user,
			dispatchId: dispatch._id,
			decision: "decline",
		});

		await expect(
			call(
				dispatchRouter.commitSignedResponse,
				{
					dispatchId: dispatch._id,
					decision: "accept",
					signature: "sig-second",
				},
				{ context: buildContext({ user: seeker.user }) },
			),
		).rejects.toMatchObject({ code: "CONFLICT" });

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

		const cancelled = await seedPendingDispatch({
			briefingId: briefing._id,
			incidentId: briefing.incidentId,
			responderIds: ["responder-C"],
		});
		await DispatchModel.findByIdAndUpdate(cancelled._id, {
			status: "cancelled",
		});

		const list = await call(dispatchRouter.list, undefined as never, {
			context: buildContext(),
		});

		expect(list).toHaveLength(2);
		expect(list[0]?._id).toBe(newer._id);
		expect(list[1]?._id).toBe(older._id);
	});

	it("get returns the dispatch plus its responses, ordered by respondedAt", async () => {
		const { briefing } = await seedBriefing();
		const seekerA = await seedSiwsResponder();
		const seekerB = await seedSiwsResponder();
		const dispatch = await seedPendingDispatch({
			briefingId: briefing._id,
			incidentId: briefing.incidentId,
			responderIds: [seekerA.id, seekerB.id],
			requiredAccepts: 2,
		});

		await commitFor({
			user: seekerA.user,
			dispatchId: dispatch._id,
			decision: "decline",
		});
		await commitFor({
			user: seekerB.user,
			dispatchId: dispatch._id,
			decision: "accept",
		});

		const result = await call(
			dispatchRouter.get,
			{ id: dispatch._id },
			{ context: buildContext() },
		);

		expect(result.dispatch._id).toBe(dispatch._id);
		expect(result.responses).toHaveLength(2);
		expect(result.responses[0]?.responderId).toBe(seekerA.id);
		expect(result.responses[1]?.responderId).toBe(seekerB.id);
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
		const seeker = await seedSiwsResponder();
		const dispatch = await seedPendingDispatch({
			briefingId: briefing._id,
			incidentId: briefing.incidentId,
			responderIds: [seeker.id],
			requiredAccepts: 1,
		});
		const ctx = buildContext({ user: seeker.user });

		await commitFor({
			user: seeker.user,
			dispatchId: dispatch._id,
			decision: "accept",
		});

		const cleared = await call(
			dispatchRouter.clear,
			{ dispatchId: dispatch._id, clearedBy: seeker.id },
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
				clearedBy: seeker.id,
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

		const unchanged = await DispatchModel.findById(dispatch._id).lean();
		expect(unchanged?.status).toBe("pending");
	});

	it("is not idempotent — clearing an already-cleared dispatch returns CONFLICT", async () => {
		const { briefing } = await seedBriefing();
		const seeker = await seedSiwsResponder();
		const dispatch = await seedPendingDispatch({
			briefingId: briefing._id,
			incidentId: briefing.incidentId,
			responderIds: [seeker.id],
			requiredAccepts: 1,
		});
		const ctx = buildContext({ user: seeker.user });

		await commitFor({
			user: seeker.user,
			dispatchId: dispatch._id,
			decision: "accept",
		});
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
		const seeker = await seedSiwsResponder();
		const dispatch = await seedPendingDispatch({
			briefingId: briefing._id,
			incidentId: briefing.incidentId,
			responderIds: [seeker.id],
			requiredAccepts: 1,
		});
		const ctx = buildContext({ user: seeker.user });

		await commitFor({
			user: seeker.user,
			dispatchId: dispatch._id,
			decision: "accept",
		});
		await call(
			dispatchRouter.clear,
			{ dispatchId: dispatch._id },
			{ context: ctx },
		);

		const list = await call(dispatchRouter.list, undefined as never, {
			context: ctx,
		});
		expect(list.find((d) => d._id === dispatch._id)).toBeUndefined();
	});

	it("fires x402 settlement after a successful clear", async () => {
		const { briefing } = await seedBriefing();
		const seeker = await seedSiwsResponder();
		const dispatch = await seedPendingDispatch({
			briefingId: briefing._id,
			incidentId: briefing.incidentId,
			responderIds: [seeker.id],
			requiredAccepts: 1,
		});
		const ctx = buildContext({ user: seeker.user });

		await commitFor({
			user: seeker.user,
			dispatchId: dispatch._id,
			decision: "accept",
		});
		await call(
			dispatchRouter.clear,
			{ dispatchId: dispatch._id },
			{ context: ctx },
		);
		await flushMicrotasks();

		expect(triggerX402PaymentMock).toHaveBeenCalledTimes(1);
		expect(triggerX402PaymentMock).toHaveBeenCalledWith(
			ctx.config,
			ctx.log,
			dispatch._id,
		);
	});

	it("does not fire x402 settlement when the clear is rejected", async () => {
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
		await flushMicrotasks();

		expect(triggerX402PaymentMock).not.toHaveBeenCalled();
	});
});

describe("dispatch.commitSignedClear", () => {
	it("flips a claimed dispatch to cleared, resolves the incident, broadcasts, and fires x402", async () => {
		const { incident, briefing } = await seedBriefing();
		const seeker = await seedSiwsResponder();
		const dispatch = await seedPendingDispatch({
			briefingId: briefing._id,
			incidentId: briefing.incidentId,
			responderIds: [seeker.id],
			requiredAccepts: 1,
		});
		const ctx = buildContext({ user: seeker.user });

		await commitFor({
			user: seeker.user,
			dispatchId: dispatch._id,
			decision: "accept",
		});

		const cleared = await call(
			dispatchRouter.commitSignedClear,
			{ dispatchId: dispatch._id, signature: "sig-clear-1" },
			{ context: ctx },
		);
		await flushMicrotasks();

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
				clearedBy: seeker.id,
			}),
		);

		expect(triggerX402PaymentMock).toHaveBeenCalledTimes(1);
		expect(triggerX402PaymentMock).toHaveBeenCalledWith(
			ctx.config,
			ctx.log,
			dispatch._id,
		);
	});

	it("does not fire x402 when the dispatch is still pending (CONFLICT)", async () => {
		const { briefing } = await seedBriefing();
		const seeker = await seedSiwsResponder();
		const dispatch = await seedPendingDispatch({
			briefingId: briefing._id,
			incidentId: briefing.incidentId,
			responderIds: [seeker.id],
			requiredAccepts: 1,
		});

		await expect(
			call(
				dispatchRouter.commitSignedClear,
				{ dispatchId: dispatch._id, signature: "sig-clear-pending" },
				{ context: buildContext({ user: seeker.user }) },
			),
		).rejects.toMatchObject({ code: "CONFLICT" });
		await flushMicrotasks();

		expect(triggerX402PaymentMock).not.toHaveBeenCalled();
		const unchanged = await DispatchModel.findById(dispatch._id).lean();
		expect(unchanged?.status).toBe("pending");
	});

	it("does not fire x402 when the dispatch is already cleared (second clear is CONFLICT)", async () => {
		const { briefing } = await seedBriefing();
		const seeker = await seedSiwsResponder();
		const dispatch = await seedPendingDispatch({
			briefingId: briefing._id,
			incidentId: briefing.incidentId,
			responderIds: [seeker.id],
			requiredAccepts: 1,
		});
		const ctx = buildContext({ user: seeker.user });

		await commitFor({
			user: seeker.user,
			dispatchId: dispatch._id,
			decision: "accept",
		});
		await call(
			dispatchRouter.commitSignedClear,
			{ dispatchId: dispatch._id, signature: "sig-clear-once" },
			{ context: ctx },
		);
		await flushMicrotasks();
		expect(triggerX402PaymentMock).toHaveBeenCalledTimes(1);

		await expect(
			call(
				dispatchRouter.commitSignedClear,
				{ dispatchId: dispatch._id, signature: "sig-clear-twice" },
				{ context: ctx },
			),
		).rejects.toMatchObject({ code: "CONFLICT" });
		await flushMicrotasks();

		expect(triggerX402PaymentMock).toHaveBeenCalledTimes(1);
	});

	it("returns NOT_FOUND for an unknown dispatch and does not fire x402", async () => {
		const seeker = await seedSiwsResponder();

		await expect(
			call(
				dispatchRouter.commitSignedClear,
				{ dispatchId: "ghost-dispatch", signature: "sig-ghost" },
				{ context: buildContext({ user: seeker.user }) },
			),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		await flushMicrotasks();

		expect(triggerX402PaymentMock).not.toHaveBeenCalled();
	});

	it("clear succeeds even if x402 settlement throws (non-blocking)", async () => {
		triggerX402PaymentMock.mockRejectedValueOnce(new Error("rpc down"));

		const { briefing } = await seedBriefing();
		const seeker = await seedSiwsResponder();
		const dispatch = await seedPendingDispatch({
			briefingId: briefing._id,
			incidentId: briefing.incidentId,
			responderIds: [seeker.id],
			requiredAccepts: 1,
		});
		const ctx = buildContext({ user: seeker.user });

		await commitFor({
			user: seeker.user,
			dispatchId: dispatch._id,
			decision: "accept",
		});

		const cleared = await call(
			dispatchRouter.commitSignedClear,
			{ dispatchId: dispatch._id, signature: "sig-clear-rpc-down" },
			{ context: ctx },
		);
		await flushMicrotasks();

		expect(cleared.status).toBe("cleared");
		expect(triggerX402PaymentMock).toHaveBeenCalledTimes(1);
	});
});

describe("dispatch lifecycle smoke", () => {
	beforeEach(() => {
		vi.useRealTimers();
	});

	it("end-to-end: confirm → SIWS accept → push fired → dispatch claimed", async () => {
		const seekerA = await seedSiwsResponder();
		const seekerB = await seedSiwsResponder();
		const { briefing } = await seedBriefing({
			recommendedResponderIds: [seekerA.id, seekerB.id],
		});
		const ctx = buildContext({ user: seekerA.user });

		const dispatch = await call(
			dispatchRouter.confirm,
			{ briefingId: briefing._id, decisionMaker: "human" },
			{ context: ctx },
		);

		const accepted = await call(
			dispatchRouter.commitSignedResponse,
			{
				dispatchId: dispatch._id,
				decision: "accept",
				signature: "sig-smoke",
			},
			{ context: ctx },
		);

		expect(accepted.dispatch.status).toBe("claimed");
		expect(accepted.dispatch.claimedByResponderIds).toEqual([seekerA.id]);

		expect(ctx.pushClient.sendPushToResponders).toHaveBeenCalledTimes(1);
		expect(ctx.dispatchBroadcaster.broadcast).toHaveBeenCalledTimes(2);
	});
});
