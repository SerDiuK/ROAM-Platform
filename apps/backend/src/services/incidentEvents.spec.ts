import { randomUUID } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeBroadcaster, makeFakeLogger } from "../../test/factories.js";
import { makeSolanaSucceed, resetSolanaMock } from "../../test/mocks/solana.js";
import type { Config } from "../config.js";
import { IncidentEventModel } from "../db/models/incidentEvent.js";
import type { IncidentBroadcaster } from "../ws/incidentBroadcaster.js";
import {
	incidentIdToBytes,
	recordIncidentEvent,
	recordIncidentEventWithSignature,
	responderIdHash,
} from "./incidentEvents.js";

const HMAC_KEY = `${"0".repeat(63)}1`;
const ALT_HMAC_KEY = `${"0".repeat(62)}12`;

const fakeConfig = {
	CHAIN_HMAC_KEY: HMAC_KEY,
} as unknown as Config;

function buildDeps(): {
	config: Config;
	log: ReturnType<typeof makeFakeLogger>;
	incidentBroadcaster: ReturnType<typeof makeFakeBroadcaster>;
	asServiceDeps: () => {
		config: Config;
		log: FastifyBaseLogger;
		incidentBroadcaster: IncidentBroadcaster;
	};
} {
	const log = makeFakeLogger();
	const incidentBroadcaster = makeFakeBroadcaster();
	return {
		config: fakeConfig,
		log,
		incidentBroadcaster,
		asServiceDeps: () => ({
			config: fakeConfig,
			log: log as unknown as FastifyBaseLogger,
			incidentBroadcaster:
				incidentBroadcaster as unknown as IncidentBroadcaster,
		}),
	};
}

beforeEach(() => {
	resetSolanaMock();
});

describe("incidentIdToBytes", () => {
	it("is deterministic for the same key", () => {
		const id = randomUUID();
		expect(incidentIdToBytes(id, HMAC_KEY)).toEqual(
			incidentIdToBytes(id, HMAC_KEY),
		);
	});

	it("differs across keys for the same id", () => {
		const id = randomUUID();
		expect(incidentIdToBytes(id, HMAC_KEY)).not.toEqual(
			incidentIdToBytes(id, ALT_HMAC_KEY),
		);
	});

	it("returns 16 bytes", () => {
		expect(incidentIdToBytes(randomUUID(), HMAC_KEY)).toHaveLength(16);
	});
});

describe("responderIdHash", () => {
	it("is deterministic for the same key", () => {
		const id = randomUUID();
		expect(responderIdHash(id, HMAC_KEY)).toEqual(
			responderIdHash(id, HMAC_KEY),
		);
	});

	it("differs across keys for the same id", () => {
		const id = randomUUID();
		expect(responderIdHash(id, HMAC_KEY)).not.toEqual(
			responderIdHash(id, ALT_HMAC_KEY),
		);
	});

	it("returns 32 bytes", () => {
		expect(responderIdHash(randomUUID(), HMAC_KEY)).toHaveLength(32);
	});
});

describe("recordIncidentEvent", () => {
	it("persists, broadcasts incident.event once, and returns the wire shape when chain returns null", async () => {
		const deps = buildDeps();
		const incidentId = randomUUID();

		const event = await recordIncidentEvent(deps.asServiceDeps(), {
			incidentId,
			kind: "received",
		});

		expect(event.incidentId).toBe(incidentId);
		expect(event.kind).toBe("received");
		expect(event.solanaTxSignature).toBeUndefined();

		const persisted = await IncidentEventModel.findOne({ incidentId }).lean();
		expect(persisted).not.toBeNull();
		expect(persisted?.solanaTxSignature).toBeUndefined();

		expect(deps.incidentBroadcaster.broadcast).toHaveBeenCalledTimes(1);
		const first = deps.incidentBroadcaster.broadcast.mock.calls[0][0] as {
			type: string;
		};
		expect(first.type).toBe("incident.event");
	});

	it("patches solanaTxSignature and broadcasts incident.event.chain when chain returns a signature", async () => {
		makeSolanaSucceed("test-tx-sig");
		const deps = buildDeps();
		const incidentId = randomUUID();

		const event = await recordIncidentEvent(deps.asServiceDeps(), {
			incidentId,
			kind: "received",
		});

		expect(event.solanaTxSignature).toBeUndefined();

		await vi.waitFor(async () => {
			const fresh = await IncidentEventModel.findById(event._id).lean();
			expect(fresh?.solanaTxSignature).toBe("test-tx-sig");
		});

		expect(deps.incidentBroadcaster.broadcast).toHaveBeenCalledTimes(2);
		const types = deps.incidentBroadcaster.broadcast.mock.calls.map(
			(c) => (c[0] as { type: string }).type,
		);
		expect(types).toEqual(["incident.event", "incident.event.chain"]);

		expect(deps.log.info).toHaveBeenCalledWith(
			expect.objectContaining({ sig: "test-tx-sig", incidentId }),
			"Incident event recorded on chain",
		);
	});

	it("logs an error and does not produce an unhandled rejection when the post-chain Mongo update throws", async () => {
		makeSolanaSucceed("test-tx-sig");
		const deps = buildDeps();
		const incidentId = randomUUID();

		let unhandled: unknown = null;
		const handler = (err: unknown) => {
			unhandled = err;
		};
		process.on("unhandledRejection", handler);

		const updateSpy = vi.spyOn(IncidentEventModel, "findByIdAndUpdate");
		updateSpy.mockReturnValueOnce({
			lean: () => Promise.reject(new Error("simulated mongo failure")),
		} as never);

		try {
			const event = await recordIncidentEvent(deps.asServiceDeps(), {
				incidentId,
				kind: "received",
			});
			expect(event.incidentId).toBe(incidentId);

			await vi.waitFor(() => {
				expect(deps.log.error).toHaveBeenCalled();
			});
			// Give a late unhandledRejection a chance to fire before asserting.
			await new Promise((r) => setImmediate(r));

			expect(unhandled).toBeNull();
			expect(deps.log.error).toHaveBeenCalledWith(
				expect.objectContaining({
					err: expect.any(Error),
					incidentId,
					kind: "received",
				}),
				"recordChainSignatureFollowUp failed (non-blocking)",
			);
		} finally {
			process.off("unhandledRejection", handler);
			updateSpy.mockRestore();
		}
	});

	it("is idempotent on duplicate (incidentId, kind, responderId) — returns existing row, broadcasts once", async () => {
		const deps = buildDeps();
		const incidentId = randomUUID();
		const responderId = randomUUID();

		const first = await recordIncidentEvent(deps.asServiceDeps(), {
			incidentId,
			kind: "dispatched",
			responderId,
		});
		const second = await recordIncidentEvent(deps.asServiceDeps(), {
			incidentId,
			kind: "dispatched",
			responderId,
		});

		expect(first._id).toBe(second._id);

		const docs = await IncidentEventModel.find({
			incidentId,
			kind: "dispatched",
			responderId,
		});
		expect(docs).toHaveLength(1);

		expect(deps.incidentBroadcaster.broadcast).toHaveBeenCalledTimes(1);
	});
});

describe("recordIncidentEventWithSignature", () => {
	it("persists with the supplied signature and broadcasts incident.event once", async () => {
		const deps = buildDeps();
		const incidentId = randomUUID();

		const event = await recordIncidentEventWithSignature(deps.asServiceDeps(), {
			incidentId,
			kind: "cleared",
			solanaTxSignature: "mobile-tx-sig",
		});

		expect(event.solanaTxSignature).toBe("mobile-tx-sig");

		const persisted = await IncidentEventModel.findOne({ incidentId }).lean();
		expect(persisted?.solanaTxSignature).toBe("mobile-tx-sig");

		expect(deps.incidentBroadcaster.broadcast).toHaveBeenCalledTimes(1);
		const first = deps.incidentBroadcaster.broadcast.mock.calls[0][0] as {
			type: string;
		};
		expect(first.type).toBe("incident.event");
	});

	it("returns the existing event without re-broadcasting on duplicate", async () => {
		const deps = buildDeps();
		const incidentId = randomUUID();

		const first = await recordIncidentEventWithSignature(deps.asServiceDeps(), {
			incidentId,
			kind: "cleared",
			solanaTxSignature: "mobile-tx-sig",
		});
		const second = await recordIncidentEventWithSignature(
			deps.asServiceDeps(),
			{
				incidentId,
				kind: "cleared",
				solanaTxSignature: "mobile-tx-sig",
			},
		);

		expect(first._id).toBe(second._id);
		expect(deps.incidentBroadcaster.broadcast).toHaveBeenCalledTimes(1);
	});
});
