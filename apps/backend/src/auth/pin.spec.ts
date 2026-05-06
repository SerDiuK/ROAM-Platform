import { describe, expect, it } from "vitest";
import { hashPin, verifyPin } from "./pin.js";

describe("hashPin / verifyPin", () => {
	it("verifies a correct PIN against its hash", async () => {
		const hash = await hashPin("0000");
		expect(await verifyPin("0000", hash)).toBe(true);
	});

	it("rejects an incorrect PIN", async () => {
		const hash = await hashPin("0000");
		expect(await verifyPin("9999", hash)).toBe(false);
	});

	it("produces different hashes for the same PIN (random salt)", async () => {
		const a = await hashPin("0000");
		const b = await hashPin("0000");
		expect(a).not.toBe(b);
		// but both verify against the same plaintext
		expect(await verifyPin("0000", a)).toBe(true);
		expect(await verifyPin("0000", b)).toBe(true);
	});

	it("rejects a PIN against a hash from a different PIN", async () => {
		const hash = await hashPin("1234");
		expect(await verifyPin("12345", hash)).toBe(false);
		expect(await verifyPin("123", hash)).toBe(false);
	});
});
