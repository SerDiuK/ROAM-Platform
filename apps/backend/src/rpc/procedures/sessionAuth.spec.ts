import { call } from "@orpc/server";
import { describe, expect, it } from "vitest";
import {
	makeFakeBroadcaster,
	makeFakeLogger,
	makeResponder,
} from "../../../test/factories.js";
import { hashPin } from "../../auth/pin.js";
import type { Config } from "../../config.js";
import { ResponderModel } from "../../db/models/responder.js";
import type { AuthedUser, RpcContext } from "../context.js";
import { sessionAuthRouter } from "./sessionAuth.js";

const SECRET = "0".repeat(64);
const TTL = 3600;

const fakeConfig = {
	AUTH_SECRET: SECRET,
	AUTH_TOKEN_TTL_SECS: TTL,
} as unknown as Config;

function buildContext(user: AuthedUser | null = null): RpcContext {
	return {
		config: fakeConfig,
		incidentBroadcaster:
			makeFakeBroadcaster() as unknown as RpcContext["incidentBroadcaster"],
		dispatchBroadcaster:
			makeFakeBroadcaster() as unknown as RpcContext["dispatchBroadcaster"],
		walletProvider: {} as RpcContext["walletProvider"],
		transcriber: {} as RpcContext["transcriber"],
		anthropic: {} as RpcContext["anthropic"],
		pushClient: {} as RpcContext["pushClient"],
		log: makeFakeLogger() as unknown as RpcContext["log"],
		user,
	};
}

async function makeResponderWithPin(
	name: string,
	pin: string,
): Promise<{ _id: string }> {
	const op = await makeResponder({ name });
	await ResponderModel.findByIdAndUpdate(op._id, { pinHash: await hashPin(pin) });
	return { _id: op._id };
}

describe("auth.signIn", () => {
	it("returns a token + responder on a correct PIN", async () => {
		const op = await makeResponderWithPin("ALPHA-1", "0000");

		const result = await call(
			sessionAuthRouter.signIn,
			{ name: "ALPHA-1", pin: "0000" },
			{ context: buildContext() },
		);

		expect(result.token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
		expect(result.responder._id).toBe(op._id);
		expect(result.responder.name).toBe("ALPHA-1");
		// pinHash must NOT be returned even though we just authenticated
		expect((result.responder as unknown as { pinHash?: string }).pinHash).toBeUndefined();
	});

	it("rejects with UNAUTHORIZED on an unknown name", async () => {
		await expect(
			call(
				sessionAuthRouter.signIn,
				{ name: "GHOST", pin: "0000" },
				{ context: buildContext() },
			),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});

	it("rejects with UNAUTHORIZED on a wrong PIN", async () => {
		await makeResponderWithPin("ALPHA-2", "0000");
		await expect(
			call(
				sessionAuthRouter.signIn,
				{ name: "ALPHA-2", pin: "9999" },
				{ context: buildContext() },
			),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});

	it("rejects with UNAUTHORIZED when a responder has no pinHash set yet", async () => {
		// Responders are seeded with PINs by the seed script. A responder created
		// outside that flow (e.g., legacy data) must not be sign-in-able.
		await makeResponder({ name: "ALPHA-3" });
		await expect(
			call(
				sessionAuthRouter.signIn,
				{ name: "ALPHA-3", pin: "0000" },
				{ context: buildContext() },
			),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});

	it("does not leak which names exist (same error for unknown name vs wrong PIN)", async () => {
		await makeResponderWithPin("ALPHA-4", "0000");

		const wrongPin = await call(
			sessionAuthRouter.signIn,
			{ name: "ALPHA-4", pin: "9999" },
			{ context: buildContext() },
		).catch((e: unknown) => e);
		const unknownName = await call(
			sessionAuthRouter.signIn,
			{ name: "WHO", pin: "0000" },
			{ context: buildContext() },
		).catch((e: unknown) => e);

		expect((wrongPin as { message: string }).message).toBe(
			(unknownName as { message: string }).message,
		);
	});
});

describe("auth.me", () => {
	it("returns the responder resolved from ctx.user", async () => {
		const op = await makeResponder({ name: "ALPHA-5" });
		const result = await call(
			sessionAuthRouter.me,
			undefined as never,
			{
				context: buildContext({
					id: op._id,
					name: op.name,
					role: "responder",
				}),
			},
		);
		expect(result.responder._id).toBe(op._id);
		expect(result.responder.name).toBe("ALPHA-5");
	});

	it("rejects with UNAUTHORIZED when no user in context (middleware gate)", async () => {
		await expect(
			call(sessionAuthRouter.me, undefined as never, {
				context: buildContext(null),
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});

	it("rejects with UNAUTHORIZED if the responder was deleted after the token was issued", async () => {
		await expect(
			call(sessionAuthRouter.me, undefined as never, {
				context: buildContext({
					id: "ghost-id",
					name: "GHOST",
					role: "responder",
				}),
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});
});
