import { describe, expect, it } from "vitest";
import { signSessionToken, verifySessionToken } from "./jwt.js";

const SECRET = "0".repeat(64);
const ALT_SECRET = "1".repeat(64);

describe("signSessionToken / verifySessionToken", () => {
	it("round-trips responder claims", async () => {
		const token = await signSessionToken(
			{ sub: "rsp-1", name: "ALPHA-1", role: "responder" },
			SECRET,
			3600,
		);
		const claims = await verifySessionToken(token, SECRET);
		expect(claims).toEqual({
			sub: "rsp-1",
			name: "ALPHA-1",
			role: "responder",
		});
	});

	it("round-trips dispatcher claims", async () => {
		const token = await signSessionToken(
			{ sub: "dsp-1", name: "DSP-1", role: "dispatcher" },
			SECRET,
			3600,
		);
		const claims = await verifySessionToken(token, SECRET);
		expect(claims.role).toBe("dispatcher");
	});

	it("rejects a token signed with a different secret", async () => {
		const token = await signSessionToken(
			{ sub: "rsp-1", name: "ALPHA-1", role: "responder" },
			SECRET,
			3600,
		);
		await expect(verifySessionToken(token, ALT_SECRET)).rejects.toThrow();
	});

	it("rejects an expired token", async () => {
		const token = await signSessionToken(
			{ sub: "rsp-1", name: "ALPHA-1", role: "responder" },
			SECRET,
			-10, // already expired
		);
		await expect(verifySessionToken(token, SECRET)).rejects.toThrow();
	});

	it("rejects garbage token strings", async () => {
		await expect(verifySessionToken("not-a-jwt", SECRET)).rejects.toThrow();
	});
});
