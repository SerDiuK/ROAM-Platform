import { describe, expect, it } from "vitest";
import { makeFakeLogger } from "../../test/factories.js";
import type { Config } from "../config.js";
import { signSessionToken } from "./jwt.js";
import { extractToken, resolveUserFromSource } from "./resolveUser.js";

const SECRET = "0".repeat(64);
const fakeConfig = { AUTH_SECRET: SECRET } as unknown as Config;
const log = makeFakeLogger() as unknown as Parameters<
	typeof resolveUserFromSource
>[2];

describe("extractToken", () => {
	it("parses a Bearer token from Authorization header", () => {
		expect(extractToken({ authorization: "Bearer abc.def.ghi" })).toBe(
			"abc.def.ghi",
		);
	});

	it("is case-insensitive on the scheme", () => {
		expect(extractToken({ authorization: "bearer abc" })).toBe("abc");
	});

	it("returns null when Authorization is malformed", () => {
		expect(extractToken({ authorization: "Basic abc" })).toBeNull();
	});

	it("falls back to queryToken when no Authorization header", () => {
		expect(extractToken({ queryToken: "ws-token" })).toBe("ws-token");
	});

	it("prefers Authorization over queryToken when both present", () => {
		expect(
			extractToken({ authorization: "Bearer header-token", queryToken: "q" }),
		).toBe("header-token");
	});

	it("returns null when neither header nor query is present", () => {
		expect(extractToken({})).toBeNull();
	});
});

describe("resolveUserFromSource", () => {
	it("returns the AuthedUser for a valid Bearer token", async () => {
		const token = await signSessionToken(
			{ sub: "rsp-1", name: "ALPHA-1", role: "responder" },
			SECRET,
			3600,
		);
		const user = await resolveUserFromSource(
			{ authorization: `Bearer ${token}` },
			fakeConfig,
			log,
		);
		expect(user).toEqual({
			id: "rsp-1",
			name: "ALPHA-1",
			role: "responder",
		});
	});

	it("returns null on no token at all", async () => {
		const user = await resolveUserFromSource({}, fakeConfig, log);
		expect(user).toBeNull();
	});

	it("returns null on a tampered token (bad signature)", async () => {
		const token = await signSessionToken(
			{ sub: "rsp-1", name: "ALPHA-1", role: "responder" },
			SECRET,
			3600,
		);
		const tampered = `${token.slice(0, -2)}xx`;
		const user = await resolveUserFromSource(
			{ authorization: `Bearer ${tampered}` },
			fakeConfig,
			log,
		);
		expect(user).toBeNull();
	});

	it("returns null on an expired token without throwing", async () => {
		const token = await signSessionToken(
			{ sub: "rsp-1", name: "ALPHA-1", role: "responder" },
			SECRET,
			-10,
		);
		const user = await resolveUserFromSource(
			{ authorization: `Bearer ${token}` },
			fakeConfig,
			log,
		);
		expect(user).toBeNull();
	});

	it("accepts a token via WS query param", async () => {
		const token = await signSessionToken(
			{ sub: "rsp-2", name: "ALPHA-2", role: "dispatcher" },
			SECRET,
			3600,
		);
		const user = await resolveUserFromSource(
			{ queryToken: token },
			fakeConfig,
			log,
		);
		expect(user?.role).toBe("dispatcher");
	});
});
