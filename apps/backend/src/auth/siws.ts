import { randomBytes } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";

// Sign-in-with-Solana (SIWS) for the Seeker via Mobile Wallet Adapter's
// `sign_in_payload` flow. The wallet builds and signs the canonical SIWS
// message itself; backend just issues a single-use nonce, verifies the
// returned Ed25519 signature, and parses the `Nonce: …` line back out.
//
// In-memory nonce store is fine for the hackathon (single-process Fastify).
// Prod path is a Mongo TTL collection or Redis with the same `consumeNonce`
// contract.

export const SIWS_DOMAIN = "roam.dispatch";
export const SIWS_STATEMENT = "Sign in to ROAM Dispatch.";

const NONCE_TTL_MS = 5 * 60 * 1000;
// 16 random bytes → 32 hex chars. Hex (not base64url) because the Solana
// Wallet's SIWS validator follows CAIP-122 strictly: `nonce` must match
// /[A-Za-z0-9]{8,}/. Base64url's `-` and `_` cause the wallet's
// `MWABottomSheetActivity` to reject the payload before rendering its
// buttons — manifests as a grey-backdrop "stuck" sheet.
const NONCE_BYTES = 16;

export function verifySiwsSignature(
	messageBytes: Uint8Array,
	signature: Uint8Array,
	pubkey: string,
): boolean {
	let pubkeyBytes: Uint8Array;
	try {
		pubkeyBytes = new PublicKey(pubkey).toBytes();
	} catch {
		return false;
	}
	return nacl.sign.detached.verify(messageBytes, signature, pubkeyBytes);
}

// Pulls the `Nonce: …` line out of a SIWS message body. The CAIP-122 / phantom
// SIWS shape uses `Nonce: ` (capital N, single space) — match that exactly so
// we don't false-positive on user-supplied statement text.
export function parseSiwsNonce(messageBytes: Uint8Array): string | null {
	const text = new TextDecoder().decode(messageBytes);
	for (const line of text.split("\n")) {
		if (line.startsWith("Nonce: ")) return line.slice("Nonce: ".length).trim();
	}
	return null;
}

type NonceEntry = { expiresAt: number };
const nonceStore = new Map<string, NonceEntry>();

// Stateless w.r.t. pubkey — we don't know which Seeker account will sign at
// challenge time (the user may pick mid-`authorize`). Single-use enforcement
// + TTL + the wallet's own signature over the message are enough to prevent
// replay; tying the nonce to a specific pubkey was belt-and-suspenders.
export function issueNonce(): { nonce: string; expiresAt: Date } {
	const nonce = randomBytes(NONCE_BYTES).toString("hex");
	const expiresAt = new Date(Date.now() + NONCE_TTL_MS);
	nonceStore.set(nonce, { expiresAt: expiresAt.getTime() });
	return { nonce, expiresAt };
}

export function consumeNonce(nonce: string): boolean {
	const entry = nonceStore.get(nonce);
	if (!entry) return false;
	// Single-use regardless of expiry — pull it out before any other check so
	// a replay attempt can't be retried.
	nonceStore.delete(nonce);
	return entry.expiresAt >= Date.now();
}

export function __resetNonceStoreForTests(): void {
	nonceStore.clear();
}
