import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeLogger } from "../../test/factories.js";
import {
	makeSolanaSucceed,
	mockedWithSolanaProvider,
	resetSolanaMock,
} from "../../test/mocks/solana.js";
import type { Config } from "../config.js";
import { IncidentEventModel } from "../db/models/incidentEvent.js";
import {
	incidentIdToBytes,
	recordIncidentEvent,
	recordIncidentEventWithSignature,
	responderIdHash,
} from "./incidentEvents.js";

const HMAC_KEY = `${"0".repeat(63)}1`;
const ALT_HMAC_KEY = `${"0".repeat(62)}12`;

// The event service reads only CHAIN_HMAC_KEY from the config.
const config = { CHAIN_HMAC_KEY: HMAC_KEY } as Config;

function buildDeps(): {
	config: Config;
	log: ReturnType<typeof makeFakeLogger>;
} {
	return { config, log: makeFakeLogger() };
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
	it("persists the event without a signature when the chain write is skipped", async () => {
		const incidentId = randomUUID();

		await recordIncidentEvent(buildDeps(), { incidentId, kind: "received" });

		const persisted = await IncidentEventModel.findOne({ incidentId }).lean();
		expect(persisted?.kind).toBe("received");
		expect(persisted?.solanaTxSignature).toBeUndefined();
	});

	it("patches in the chain signature once the write lands", async () => {
		makeSolanaSucceed("test-tx-sig");
		const incidentId = randomUUID();

		await recordIncidentEvent(buildDeps(), { incidentId, kind: "received" });

		await vi.waitFor(async () => {
			const fresh = await IncidentEventModel.findOne({ incidentId }).lean();
			expect(fresh?.solanaTxSignature).toBe("test-tx-sig");
		});
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

		const updateSpy = vi
			.spyOn(IncidentEventModel, "findByIdAndUpdate")
			.mockImplementationOnce(() => {
				throw new Error("simulated mongo failure");
			});

		try {
			await recordIncidentEvent(deps, { incidentId, kind: "received" });

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
				expect.any(String),
			);
		} finally {
			process.off("unhandledRejection", handler);
			updateSpy.mockRestore();
		}
	});

	it("stores and writes a duplicate (incidentId, kind, responderId) only once", async () => {
		const incidentId = randomUUID();
		const responderId = randomUUID();
		const args = { incidentId, kind: "dispatched" as const, responderId };

		await recordIncidentEvent(buildDeps(), args);
		await recordIncidentEvent(buildDeps(), args);

		expect(await IncidentEventModel.countDocuments(args)).toBe(1);
		expect(mockedWithSolanaProvider).toHaveBeenCalledTimes(1);
	});
});

describe("recordIncidentEventWithSignature", () => {
	it("persists the supplied signature", async () => {
		const incidentId = randomUUID();

		await recordIncidentEventWithSignature(buildDeps(), {
			incidentId,
			kind: "cleared",
			solanaTxSignature: "mobile-tx-sig",
		});

		const persisted = await IncidentEventModel.findOne({ incidentId }).lean();
		expect(persisted?.solanaTxSignature).toBe("mobile-tx-sig");
	});

	it("absorbs a duplicate without throwing", async () => {
		const args = {
			incidentId: randomUUID(),
			kind: "cleared" as const,
			solanaTxSignature: "mobile-tx-sig",
		};

		await recordIncidentEventWithSignature(buildDeps(), args);

		await expect(
			recordIncidentEventWithSignature(buildDeps(), args),
		).resolves.toBeUndefined();
	});
});
