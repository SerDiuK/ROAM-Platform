import { randomBytes } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";

export const SIWS_DOMAIN = "roam.dispatch";
export const SIWS_STATEMENT = "Sign in to ROAM Dispatch.";

const NONCE_TTL_MS = 5 * 60 * 1000;
// Hex, not base64url: the wallet's CAIP-122 check needs /[A-Za-z0-9]{8,}/ and otherwise leaves its sheet stuck.
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

export function parseSiwsNonce(messageBytes: Uint8Array): string | null {
	const text = new TextDecoder().decode(messageBytes);
	for (const line of text.split("\n")) {
		if (line.startsWith("Nonce: ")) return line.slice("Nonce: ".length).trim();
	}
	return null;
}

type NonceEntry = { expiresAt: number };
// In-memory, so nonces only work while the backend runs as a single process.
const nonceStore = new Map<string, NonceEntry>();

// Not bound to a pubkey: the wallet account is only picked during MWA authorize, after this.
export function issueNonce(): { nonce: string; expiresAt: Date } {
	const nonce = randomBytes(NONCE_BYTES).toString("hex");
	const expiresAt = new Date(Date.now() + NONCE_TTL_MS);
	nonceStore.set(nonce, { expiresAt: expiresAt.getTime() });
	return { nonce, expiresAt };
}

export function consumeNonce(nonce: string): boolean {
	const entry = nonceStore.get(nonce);
	if (!entry) return false;
	// Single-use regardless of expiry: delete before any other check.
	nonceStore.delete(nonce);
	return entry.expiresAt >= Date.now();
}

export function __resetNonceStoreForTests(): void {
	nonceStore.clear();
}
