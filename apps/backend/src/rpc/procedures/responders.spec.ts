import { randomUUID } from "node:crypto";
import { call } from "@orpc/server";
import { describe, expect, it } from "vitest";
import { makeResponder, makeRpcContext } from "../../../test/factories.js";
import { ResponderModel } from "../../db/models/responder.js";
import type { AuthedUser, RpcContext } from "../context.js";
import { respondersRouter } from "./responders.js";

const dispatcherUser: AuthedUser = {
	id: "test-dispatcher",
	name: "DSP-TEST",
	role: "dispatcher",
};

function makeResponderUser(responderId: string, name = "TEST"): AuthedUser {
	return { id: responderId, name, role: "responder" };
}

function buildContext(user: AuthedUser = dispatcherUser): RpcContext {
	return makeRpcContext({}, { user });
}

describe("responders.enrol", () => {
	it("re-enrolling the same name updates the one responder", async () => {
		const first = await call(
			respondersRouter.enrol,
			{ name: "ALPHA-2", role: "responder", availability: "available" },
			{ context: buildContext() },
		);
		const second = await call(
			respondersRouter.enrol,
			{ name: "ALPHA-2", role: "responder", availability: "occupied" },
			{ context: buildContext() },
		);

		expect(first.responder._id).toBe(second.responder._id);
		expect(second.responder.availability).toBe("occupied");
	});
});

describe("responders.upsertPushToken", () => {
	it("appends a new token to the responder resolved from ctx.user", async () => {
		const responder = await makeResponder({ name: "BRAVO-1" });
		const token = "ExponentPushToken[abc-123]";

		const result = await call(
			respondersRouter.upsertPushToken,
			{ token },
			{
				context: buildContext(makeResponderUser(responder._id, responder.name)),
			},
		);

		expect(result.tokenCount).toBe(1);
		const after = await ResponderModel.findById(responder._id).lean();
		expect(after?.pushTokens).toEqual([token]);
	});

	it("de-dupes when the same token is upserted twice for the same responder", async () => {
		const responder = await makeResponder({ name: "BRAVO-2" });
		const token = "ExponentPushToken[xyz-789]";
		const user = makeResponderUser(responder._id, responder.name);

		await call(
			respondersRouter.upsertPushToken,
			{ token },
			{ context: buildContext(user) },
		);
		const second = await call(
			respondersRouter.upsertPushToken,
			{ token },
			{ context: buildContext(user) },
		);

		expect(second.tokenCount).toBe(1);
		const after = await ResponderModel.findById(responder._id).lean();
		expect(after?.pushTokens).toEqual([token]);
	});

	it("appends a second distinct token from a different device", async () => {
		const responder = await makeResponder({ name: "BRAVO-3" });
		const user = makeResponderUser(responder._id, responder.name);

		await call(
			respondersRouter.upsertPushToken,
			{ token: "ExponentPushToken[device-A]" },
			{ context: buildContext(user) },
		);
		const second = await call(
			respondersRouter.upsertPushToken,
			{ token: "ExponentPushToken[device-B]" },
			{ context: buildContext(user) },
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
		const ghostId = randomUUID();

		await expect(
			call(
				respondersRouter.upsertPushToken,
				{ token: "ExponentPushToken[ghost]" },
				{ context: buildContext(makeResponderUser(ghostId, "GHOST")) },
			),
		).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
	});
});
