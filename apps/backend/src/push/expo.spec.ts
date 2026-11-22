import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResponderModel } from "../db/models/responder.js";

const sendPushNotificationsAsync = vi.fn(async (msgs: unknown[]) =>
	msgs.map((_, i) => ({ status: "ok" as const, id: `ticket-${i}` })),
);
const chunkPushNotifications = vi.fn((msgs: unknown[]) => {
	const chunks: unknown[][] = [];
	for (let i = 0; i < msgs.length; i += 100) {
		chunks.push(msgs.slice(i, i + 100));
	}
	return chunks;
});
const isExpoPushToken = vi.fn(
	(token: unknown): token is string =>
		typeof token === "string" && token.startsWith("ExponentPushToken["),
);

vi.mock("expo-server-sdk", () => {
	class Expo {
		sendPushNotificationsAsync = sendPushNotificationsAsync;
		chunkPushNotifications = chunkPushNotifications;
		static isExpoPushToken = isExpoPushToken;
	}
	return { Expo, default: Expo };
});

// Import after vi.mock so the SUT picks up the mocked module.
const { createExpoPushClient } = await import("./expo.js");

async function makeResponderWithTokens(
	tokens: string[],
): Promise<{ _id: string }> {
	const doc = await new ResponderModel({
		_id: randomUUID(),
		name: `RSP-${randomUUID().slice(0, 6)}`,
		role: "responder",
		availability: "available",
		pushTokens: tokens,
	}).save();
	return { _id: doc._id };
}

describe("createExpoPushClient.sendPushToResponders", () => {
	beforeEach(() => {
		sendPushNotificationsAsync.mockClear();
		chunkPushNotifications.mockClear();
		isExpoPushToken.mockClear();
	});

	it("returns early without calling Expo when no responders are passed", async () => {
		const client = createExpoPushClient();
		const result = await client.sendPushToResponders([], {
			title: "t",
			body: "b",
		});

		expect(result).toEqual({ tickets: [], delivered: 0, skipped: 0 });
		expect(sendPushNotificationsAsync).not.toHaveBeenCalled();
		expect(chunkPushNotifications).not.toHaveBeenCalled();
	});

	it("filters out tokens that are not valid Expo tokens, counting them as skipped", async () => {
		const op = await makeResponderWithTokens([
			"ExponentPushToken[good-1]",
			"fcm:not-an-expo-token",
			"ExponentPushToken[good-2]",
		]);

		const client = createExpoPushClient();
		const result = await client.sendPushToResponders([op._id], {
			title: "Dispatch",
			body: "New incident",
		});

		expect(result.skipped).toBe(1);
		expect(result.delivered).toBe(2);
		expect(sendPushNotificationsAsync).toHaveBeenCalledTimes(1);
		const sentMessages = sendPushNotificationsAsync.mock
			.calls[0]?.[0] as Array<{
			to: string;
		}>;
		expect(sentMessages.map((m) => m.to)).toEqual([
			"ExponentPushToken[good-1]",
			"ExponentPushToken[good-2]",
		]);
	});

	it("chunks messages at 100 per call (150 tokens → 2 chunks)", async () => {
		const tokens = Array.from(
			{ length: 150 },
			(_, i) => `ExponentPushToken[bulk-${i}]`,
		);
		const op = await makeResponderWithTokens(tokens);

		const client = createExpoPushClient();
		const result = await client.sendPushToResponders([op._id], {
			title: "Bulk",
			body: "Bulk dispatch",
		});

		expect(chunkPushNotifications).toHaveBeenCalledTimes(1);
		expect(sendPushNotificationsAsync).toHaveBeenCalledTimes(2);
		expect(result.delivered).toBe(150);
		expect(result.tickets).toHaveLength(150);
	});

	it("skips responders with no pushTokens silently", async () => {
		const op = await makeResponderWithTokens([]);

		const client = createExpoPushClient();
		const result = await client.sendPushToResponders([op._id], {
			title: "t",
			body: "b",
		});

		expect(result.delivered).toBe(0);
		expect(result.skipped).toBe(0);
		expect(sendPushNotificationsAsync).not.toHaveBeenCalled();
	});

	it("returns the tickets produced by Expo", async () => {
		const op = await makeResponderWithTokens([
			"ExponentPushToken[a]",
			"ExponentPushToken[b]",
		]);

		const client = createExpoPushClient();
		const result = await client.sendPushToResponders([op._id], {
			title: "t",
			body: "b",
		});

		expect(result.tickets).toEqual([
			{ status: "ok", id: "ticket-0" },
			{ status: "ok", id: "ticket-1" },
		]);
	});

	it("forwards data + title + body to Expo per recipient", async () => {
		const op = await makeResponderWithTokens(["ExponentPushToken[a]"]);

		const client = createExpoPushClient();
		await client.sendPushToResponders([op._id], {
			title: "Dispatch",
			body: "Multi-vehicle crash",
			data: { type: "dispatch.created", dispatchId: "d-1" },
		});

		const sent = sendPushNotificationsAsync.mock.calls[0]?.[0] as Array<{
			to: string;
			title: string;
			body: string;
			data?: Record<string, unknown>;
			priority: string;
			sound: string;
		}>;
		expect(sent).toHaveLength(1);
		expect(sent[0]).toMatchObject({
			to: "ExponentPushToken[a]",
			title: "Dispatch",
			body: "Multi-vehicle crash",
			data: { type: "dispatch.created", dispatchId: "d-1" },
			priority: "high",
			sound: "default",
		});
	});

	it("warns via the injected logger when a non-Expo token is dropped", async () => {
		const op = await makeResponderWithTokens([
			"raw-fcm-token",
			"ExponentPushToken[ok]",
		]);
		const warn = vi.fn();

		const client = createExpoPushClient({ logger: { warn } });
		await client.sendPushToResponders([op._id], { title: "t", body: "b" });

		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0]?.[0]).toMatchObject({ token: "raw-fcm-token" });
	});
});
