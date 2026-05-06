import { randomUUID } from "node:crypto";
import { call } from "@orpc/server";
import { describe, expect, it, vi } from "vitest";
import {
	makeFakeBroadcaster,
	makeFakeLogger,
	makeResponder,
} from "../../../test/factories.js";
import type { Config } from "../../config.js";
import { ResponderModel } from "../../db/models/responder.js";
import type { AuthedUser, RpcContext } from "../context.js";
import { respondersRouter } from "./responders.js";

const fakeConfig = {} as Config;

const dispatcherUser: AuthedUser = {
	id: "test-dispatcher",
	name: "DSP-TEST",
	role: "dispatcher",
};

function makeResponderUser(responderId: string, name = "TEST"): AuthedUser {
	return { id: responderId, name, role: "responder" };
}

function buildContext(
	walletProvider: RpcContext["walletProvider"],
	user: AuthedUser = dispatcherUser,
): RpcContext {
	return {
		config: fakeConfig,
		incidentBroadcaster:
			makeFakeBroadcaster() as unknown as RpcContext["incidentBroadcaster"],
		dispatchBroadcaster:
			makeFakeBroadcaster() as unknown as RpcContext["dispatchBroadcaster"],
		walletProvider,
		transcriber: {} as RpcContext["transcriber"],
		anthropic: {} as RpcContext["anthropic"],
		pushClient: {} as RpcContext["pushClient"],
		log: makeFakeLogger() as unknown as RpcContext["log"],
		user,
	};
}

function makeFakeWalletProvider(): {
	createWallet: ReturnType<typeof vi.fn>;
	getAddress: ReturnType<typeof vi.fn>;
	getBalanceUsdc: ReturnType<typeof vi.fn>;
	signAndSendUsdc: ReturnType<typeof vi.fn>;
} {
	return {
		createWallet: vi.fn(async (_responderId: string) => ({
			address: `WALLET-${randomUUID().slice(0, 8)}`,
		})),
		getAddress: vi.fn(),
		getBalanceUsdc: vi.fn(),
		signAndSendUsdc: vi.fn(),
	};
}

describe("responders.enrol", () => {
	it("auto-provisions a wallet on first enrol and returns a responder with walletAddress", async () => {
		const wallet = makeFakeWalletProvider();
		const stableAddress = `WALLET-${randomUUID().slice(0, 8)}`;
		wallet.createWallet.mockImplementation(async (responderId: string) => {
			// Mirror the real provider: persist walletAddress on the responder doc so
			// the post-enrol re-fetch can return it.
			await ResponderModel.findByIdAndUpdate(responderId, {
				walletAddress: stableAddress,
			});
			return { address: stableAddress };
		});

		const result = await call(
			respondersRouter.enrol,
			{ name: "ALPHA-1", role: "responder", availability: "available" },
			{ context: buildContext(wallet as unknown as RpcContext["walletProvider"]) },
		);

		expect(wallet.createWallet).toHaveBeenCalledTimes(1);
		expect(wallet.createWallet).toHaveBeenCalledWith(result.responder._id);
		expect(result.responder.walletAddress).toBe(stableAddress);
		expect(result.responder.name).toBe("ALPHA-1");
	});

	it("re-enrolling the same name is idempotent — single doc, walletAddress unchanged", async () => {
		const wallet = makeFakeWalletProvider();
		const stableAddress = `WALLET-${randomUUID().slice(0, 8)}`;
		wallet.createWallet.mockImplementation(async (responderId: string) => {
			const existing = await ResponderModel.findById(responderId).select(
				"walletAddress",
			);
			if (existing?.walletAddress) return { address: existing.walletAddress };
			await ResponderModel.findByIdAndUpdate(responderId, {
				walletAddress: stableAddress,
			});
			return { address: stableAddress };
		});

		const first = await call(
			respondersRouter.enrol,
			{ name: "ALPHA-2", role: "responder", availability: "available" },
			{ context: buildContext(wallet as unknown as RpcContext["walletProvider"]) },
		);
		const second = await call(
			respondersRouter.enrol,
			{ name: "ALPHA-2", role: "responder", availability: "occupied" },
			{ context: buildContext(wallet as unknown as RpcContext["walletProvider"]) },
		);

		expect(first.responder._id).toBe(second.responder._id);
		expect(second.responder.walletAddress).toBe(stableAddress);
		expect(second.responder.availability).toBe("occupied");
		const docs = await ResponderModel.find({ name: "ALPHA-2" });
		expect(docs).toHaveLength(1);
	});

	it("surfaces a 500 when walletProvider.createWallet throws", async () => {
		const wallet = makeFakeWalletProvider();
		wallet.createWallet.mockRejectedValue(new Error("rpc down"));

		await expect(
			call(
				respondersRouter.enrol,
				{ name: "ALPHA-3", role: "responder", availability: "available" },
				{
					context: buildContext(
						wallet as unknown as RpcContext["walletProvider"],
					),
				},
			),
		).rejects.toMatchObject({
			code: "INTERNAL_SERVER_ERROR",
			message: "Failed to provision responder wallet",
		});
	});
});

describe("responders.upsertPushToken", () => {
	it("appends a new token to the responder resolved from ctx.user", async () => {
		const responder = await makeResponder({ name: "BRAVO-1" });
		const wallet = makeFakeWalletProvider();
		const token = "ExponentPushToken[abc-123]";

		const result = await call(
			respondersRouter.upsertPushToken,
			{ token },
			{
				context: buildContext(
					wallet as unknown as RpcContext["walletProvider"],
					makeResponderUser(responder._id, responder.name),
				),
			},
		);

		expect(result.tokenCount).toBe(1);
		const after = await ResponderModel.findById(responder._id).lean();
		expect(after?.pushTokens).toEqual([token]);
	});

	it("de-dupes when the same token is upserted twice for the same responder", async () => {
		const responder = await makeResponder({ name: "BRAVO-2" });
		const wallet = makeFakeWalletProvider();
		const token = "ExponentPushToken[xyz-789]";
		const user = makeResponderUser(responder._id, responder.name);

		await call(
			respondersRouter.upsertPushToken,
			{ token },
			{
				context: buildContext(
					wallet as unknown as RpcContext["walletProvider"],
					user,
				),
			},
		);
		const second = await call(
			respondersRouter.upsertPushToken,
			{ token },
			{
				context: buildContext(
					wallet as unknown as RpcContext["walletProvider"],
					user,
				),
			},
		);

		expect(second.tokenCount).toBe(1);
		const after = await ResponderModel.findById(responder._id).lean();
		expect(after?.pushTokens).toEqual([token]);
	});

	it("appends a second distinct token from a different device", async () => {
		const responder = await makeResponder({ name: "BRAVO-3" });
		const wallet = makeFakeWalletProvider();
		const user = makeResponderUser(responder._id, responder.name);

		await call(
			respondersRouter.upsertPushToken,
			{ token: "ExponentPushToken[device-A]" },
			{
				context: buildContext(
					wallet as unknown as RpcContext["walletProvider"],
					user,
				),
			},
		);
		const second = await call(
			respondersRouter.upsertPushToken,
			{ token: "ExponentPushToken[device-B]" },
			{
				context: buildContext(
					wallet as unknown as RpcContext["walletProvider"],
					user,
				),
			},
		);

		expect(second.tokenCount).toBe(2);
		const after = await ResponderModel.findById(responder._id).lean();
		expect(after?.pushTokens).toEqual(
			expect.arrayContaining([
				"ExponentPushToken[device-A]",
				"ExponentPushToken[device-B]",
			]),
		);
	});

	it("rejects with NOT_FOUND when ctx.user.id points at no responder doc", async () => {
		const wallet = makeFakeWalletProvider();
		const ghostId = randomUUID();

		await expect(
			call(
				respondersRouter.upsertPushToken,
				{ token: "ExponentPushToken[ghost]" },
				{
					context: buildContext(
						wallet as unknown as RpcContext["walletProvider"],
						makeResponderUser(ghostId, "GHOST"),
					),
				},
			),
		).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
	});
});
