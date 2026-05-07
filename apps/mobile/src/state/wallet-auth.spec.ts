import { Keypair } from "@solana/web3.js";
import { createStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
	Platform: { OS: "ios" },
}));

const mwaSpy = {
	mwaAvailable: true,
	signIn: vi.fn(),
	signAndSendTransaction: vi.fn(),
};

vi.mock("@/lib/mwa", () => ({
	mwa: mwaSpy,
	SeekerCancelledError: class extends Error {
		constructor() {
			super("cancelled");
			this.name = "SeekerCancelledError";
		}
	},
	SeekerProtocolError: class extends Error {},
}));

const apiSpy = {
	auth: {
		siwsChallenge: vi.fn(),
		siwsVerify: vi.fn(),
	},
};
const setApiTokenSpy = vi.fn();

vi.mock("@/lib/api", () => ({
	api: apiSpy,
	setApiToken: setApiTokenSpy,
}));

const writeAuthTokenSpy = vi.fn(async () => {});

vi.mock("@/lib/secure-storage", () => ({
	clearAuthToken: vi.fn(async () => {}),
	clearCachedName: vi.fn(async () => {}),
	clearToken: vi.fn(async () => {}),
	readAuthToken: vi.fn(async () => null),
	readCachedName: vi.fn(async () => null),
	writeAuthToken: writeAuthTokenSpy,
	writeCachedName: vi.fn(async () => {}),
	writeToken: vi.fn(async () => {}),
}));

vi.mock("@/lib/push", () => ({
	registerPushToken: vi.fn(async () => ({ ok: true })),
}));

const { signInWithSeekerAtom } = await import("./wallet-auth.js");
const { authStateAtom } = await import("./responder.js");

const seekerKp = Keypair.generate();
const SEEKER_PUBKEY = seekerKp.publicKey.toBase58();
const SEEKER_PUBKEY_B64 = Buffer.from(seekerKp.publicKey.toBytes()).toString(
	"base64",
);

beforeEach(() => {
	mwaSpy.signIn.mockReset();
	apiSpy.auth.siwsChallenge.mockReset();
	apiSpy.auth.siwsVerify.mockReset();
	setApiTokenSpy.mockReset();
	writeAuthTokenSpy.mockReset();
});

function mockChallenge(): void {
	apiSpy.auth.siwsChallenge.mockResolvedValue({
		nonce: "n-1",
		domain: "roam.dispatch",
		statement: "Sign in to ROAM Dispatch.",
		expiresAt: "2026-05-06T12:05:00Z",
	});
}

function mockSignIn(): void {
	mwaSpy.signIn.mockResolvedValue({
		address: SEEKER_PUBKEY,
		addressBase64: SEEKER_PUBKEY_B64,
		signedMessage: "msg-b64",
		signature: "sig-b64",
		authToken: "fresh-auth-token",
	});
}

describe("signInWithSeekerAtom", () => {
	it("happy path: persists JWT + authToken, flips authState to signed-in", async () => {
		mockChallenge();
		mockSignIn();
		apiSpy.auth.siwsVerify.mockResolvedValue({
			token: "jwt-1",
			responder: {
				_id: "rsp-1",
				name: "RSP-1",
				role: "responder",
				availability: "available",
				walletAddress: SEEKER_PUBKEY,
			},
		});

		const store = createStore();
		const result = await store.set(signInWithSeekerAtom, {});

		expect(result.kind).toBe("ok");
		expect(setApiTokenSpy).toHaveBeenCalledWith("jwt-1");
		expect(writeAuthTokenSpy).toHaveBeenCalledWith("fresh-auth-token");
		expect(apiSpy.auth.siwsVerify).toHaveBeenCalledWith({
			signedMessage: "msg-b64",
			signature: "sig-b64",
			address: SEEKER_PUBKEY_B64,
			name: undefined,
		});

		const auth = store.get(authStateAtom);
		expect(auth.kind).toBe("signed-in");
	});

	it("returns wallet-unbound when backend says WALLET_UNBOUND", async () => {
		mockChallenge();
		mockSignIn();
		apiSpy.auth.siwsVerify.mockRejectedValue({
			code: "UNAUTHORIZED",
			message: "WALLET_UNBOUND",
		});

		const store = createStore();
		const result = await store.set(signInWithSeekerAtom, {});

		expect(result).toEqual({ kind: "wallet-unbound", pubkey: SEEKER_PUBKEY });
		expect(setApiTokenSpy).not.toHaveBeenCalled();
		// authToken still cached so the picker re-run is silent.
		expect(writeAuthTokenSpy).toHaveBeenCalledWith("fresh-auth-token");
		expect(store.get(authStateAtom).kind).toBe("unknown");
	});

	it("returns cancelled when the user dismisses the fingerprint prompt", async () => {
		mockChallenge();
		const { SeekerCancelledError } = await import("@/lib/mwa.js");
		mwaSpy.signIn.mockRejectedValue(new SeekerCancelledError());

		const store = createStore();
		const result = await store.set(signInWithSeekerAtom, {});

		expect(result).toEqual({ kind: "cancelled" });
		expect(setApiTokenSpy).not.toHaveBeenCalled();
		expect(writeAuthTokenSpy).not.toHaveBeenCalled();
	});

	it("forwards the cached authToken into mwa.signIn for a silent reauthorize", async () => {
		mockChallenge();
		mockSignIn();
		apiSpy.auth.siwsVerify.mockResolvedValue({
			token: "jwt-2",
			responder: {
				_id: "rsp-2",
				name: "RSP-2",
				role: "responder",
				availability: "available",
				walletAddress: SEEKER_PUBKEY,
			},
		});
		const { readAuthToken } = await import("@/lib/secure-storage");
		vi.mocked(readAuthToken).mockResolvedValueOnce("warm-token");

		const store = createStore();
		await store.set(signInWithSeekerAtom, {});

		expect(mwaSpy.signIn).toHaveBeenCalledWith(
			{
				domain: "roam.dispatch",
				statement: "Sign in to ROAM Dispatch.",
				nonce: "n-1",
			},
			{ authToken: "warm-token" },
		);
	});

	it("returns error when MWA isn't available (web/iOS)", async () => {
		mwaSpy.mwaAvailable = false;
		const store = createStore();
		const result = await store.set(signInWithSeekerAtom, {});
		mwaSpy.mwaAvailable = true; // restore for sibling tests

		expect(result.kind).toBe("error");
		expect(apiSpy.auth.siwsChallenge).not.toHaveBeenCalled();
	});
});
