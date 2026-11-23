import { describe, expect, it } from "vitest";
import { makeFakeLogger } from "../../test/factories.js";
import type { Config } from "../config.js";
import { signSessionToken } from "./jwt.js";
import { resolveUser } from "./resolveUser.js";

const SECRET = "0".repeat(64);
// resolveUser reads only AUTH_SECRET.
const config = { AUTH_SECRET: SECRET } as Config;
const log = makeFakeLogger();

async function token(expiresInSecs = 3600): Promise<string> {
	return signSessionToken(
		{ sub: "rsp-1", name: "ALPHA-1", role: "responder" },
		SECRET,
		expiresInSecs,
	);
}

describe("resolveUser", () => {
	it("returns the AuthedUser for a valid Bearer token", async () => {
		const user = await resolveUser(`Bearer ${await token()}`, config, log);
		expect(user).toEqual({ id: "rsp-1", name: "ALPHA-1", role: "responder" });
	});

	it("is case-insensitive on the scheme", async () => {
		const user = await resolveUser(`bearer ${await token()}`, config, log);
		expect(user?.id).toBe("rsp-1");
	});

	it("ignores a non-Bearer scheme", async () => {
		expect(await resolveUser(`Basic ${await token()}`, config, log)).toBeNull();
	});

	it("returns null without an Authorization header", async () => {
		expect(await resolveUser(undefined, config, log)).toBeNull();
	});

	it("returns null on a tampered token (bad signature)", async () => {
		const tampered = `${(await token()).slice(0, -2)}xx`;
		expect(await resolveUser(`Bearer ${tampered}`, config, log)).toBeNull();
	});

	it("returns null on an expired token without throwing", async () => {
		expect(
			await resolveUser(`Bearer ${await token(-10)}`, config, log),
		).toBeNull();
	});
});
