import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	__resetNonceStoreForTests,
	consumeNonce,
	issueNonce,
	parseSiwsNonce,
	verifySiwsSignature,
} from "./siws.js";

afterEach(() => {
	__resetNonceStoreForTests();
	vi.useRealTimers();
});

function siwsBody(args: { pubkey: string; nonce: string }): string {
	return [
		"roam.dispatch wants you to sign in with your Solana account:",
		args.pubkey,
		"",
		"Sign in to ROAM Dispatch.",
		"",
		`Nonce: ${args.nonce}`,
	].join("\n");
}

describe("verifySiwsSignature", () => {
	it("accepts a valid Ed25519 signature over the message bytes", () => {
		const kp = Keypair.generate();
		const message = siwsBody({ pubkey: kp.publicKey.toBase58(), nonce: "n1" });
		const bytes = new TextEncoder().encode(message);
		const sig = nacl.sign.detached(bytes, kp.secretKey);
		expect(verifySiwsSignature(bytes, sig, kp.publicKey.toBase58())).toBe(true);
	});

	it("rejects a tampered message", () => {
		const kp = Keypair.generate();
		const original = siwsBody({ pubkey: kp.publicKey.toBase58(), nonce: "n2" });
		const sig = nacl.sign.detached(
			new TextEncoder().encode(original),
			kp.secretKey,
		);
		const tampered = original.replace("n2", "nX");
		expect(
			verifySiwsSignature(
				new TextEncoder().encode(tampered),
				sig,
				kp.publicKey.toBase58(),
			),
		).toBe(false);
	});

	it("rejects a tampered signature", () => {
		const kp = Keypair.generate();
		const message = siwsBody({ pubkey: kp.publicKey.toBase58(), nonce: "n3" });
		const bytes = new TextEncoder().encode(message);
		const sig = nacl.sign.detached(bytes, kp.secretKey);
		sig[0] = (sig[0] + 1) & 0xff;
		expect(verifySiwsSignature(bytes, sig, kp.publicKey.toBase58())).toBe(
			false,
		);
	});

	it("returns false for a malformed pubkey instead of throwing", () => {
		const kp = Keypair.generate();
		const message = siwsBody({ pubkey: kp.publicKey.toBase58(), nonce: "n4" });
		const bytes = new TextEncoder().encode(message);
		const sig = nacl.sign.detached(bytes, kp.secretKey);
		expect(verifySiwsSignature(bytes, sig, "not-a-pubkey")).toBe(false);
	});
});

describe("parseSiwsNonce", () => {
	it("extracts the Nonce: line from a CAIP-122-shaped body", () => {
		const message = siwsBody({ pubkey: "pk", nonce: "abc-123" });
		expect(parseSiwsNonce(new TextEncoder().encode(message))).toBe("abc-123");
	});

	it("returns null when no Nonce: line exists", () => {
		const message = "no nonce here\nstatement\n";
		expect(parseSiwsNonce(new TextEncoder().encode(message))).toBeNull();
	});

	it("matches the exact `Nonce: ` prefix and ignores statement-text false-positives", () => {
		const message = [
			"Nonsense: not a nonce",
			"(Nonce inside parens)",
			"Nonce: real-nonce",
		].join("\n");
		expect(parseSiwsNonce(new TextEncoder().encode(message))).toBe(
			"real-nonce",
		);
	});
});

describe("issueNonce / consumeNonce", () => {
	it("consumes a fresh nonce exactly once", () => {
		const { nonce } = issueNonce();
		expect(consumeNonce(nonce)).toBe(true);
		expect(consumeNonce(nonce)).toBe(false);
	});

	it("rejects an unknown nonce", () => {
		expect(consumeNonce("ghost")).toBe(false);
	});

	it("rejects an expired nonce", () => {
		vi.useFakeTimers();
		const { nonce, expiresAt } = issueNonce();
		vi.setSystemTime(expiresAt.getTime() + 1);
		expect(consumeNonce(nonce)).toBe(false);
	});
});
