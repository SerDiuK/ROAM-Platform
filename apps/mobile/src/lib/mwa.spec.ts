import { Keypair, Transaction } from "@solana/web3.js";
import nacl from "tweetnacl";
import { describe, expect, it, vi } from "vitest";

// Stub react-native — vitest can't parse the flow-typed RN entry. Same
// pattern as src/lib/push.spec.ts.
vi.mock("react-native", () => ({
	Platform: { OS: "ios" },
}));

const { SeekerCancelledError, SeekerProtocolError, createMwa } = await import(
	"./mwa.js"
);

type FakeWallet = {
	authorize: ReturnType<typeof vi.fn>;
	signAndSendTransactions: ReturnType<typeof vi.fn>;
};

function makeFakeWallet(kp: Keypair): FakeWallet {
	const addressB64 = Buffer.from(kp.publicKey.toBytes()).toString("base64");
	return {
		// Mirrors the MWA contract: when `sign_in_payload` is supplied, the
		// wallet builds a SIWS message, signs it, and returns the result inside
		// `sign_in_result`. We construct + sign a payload here so the test can
		// verify the bytes the wrapper hands back are independently verifiable.
		authorize: vi.fn(
			async (params: {
				sign_in_payload?: { domain: string; nonce?: string; statement?: string };
			}) => {
				const result: {
					accounts: { address: string }[];
					auth_token: string;
					sign_in_result?: {
						address: string;
						signed_message: string;
						signature: string;
					};
				} = {
					accounts: [{ address: addressB64 }],
					auth_token: "auth-token-1",
				};
				if (params.sign_in_payload) {
					const body = [
						`${params.sign_in_payload.domain} wants you to sign in with your Solana account:`,
						kp.publicKey.toBase58(),
						``,
						params.sign_in_payload.statement ?? "",
						``,
						`Nonce: ${params.sign_in_payload.nonce ?? ""}`,
					].join("\n");
					const bytes = new TextEncoder().encode(body);
					const sig = nacl.sign.detached(bytes, kp.secretKey);
					result.sign_in_result = {
						address: addressB64,
						signed_message: Buffer.from(bytes).toString("base64"),
						signature: Buffer.from(sig).toString("base64"),
					};
				}
				return result;
			},
		),
		signAndSendTransactions: vi.fn(async () => ["sig-base58-1"]),
	};
}

type TransactCb<T> = (wallet: FakeWallet) => Promise<T>;

describe("mwa.signIn", () => {
	it("returns the sign_in_result triple decoded + the auth_token", async () => {
		const kp = Keypair.generate();
		const wallet = makeFakeWallet(kp);
		const transact = async <T,>(cb: TransactCb<T>): Promise<T> => cb(wallet);

		const mwa = createMwa(transact as never);
		const result = await mwa.signIn({
			domain: "roam.dispatch",
			statement: "Sign in.",
			nonce: "n-1",
		});

		expect(result.address).toBe(kp.publicKey.toBase58());
		expect(result.authToken).toBe("auth-token-1");

		// The signed_message + signature are valid Ed25519 over the bytes the
		// wallet built — verify directly.
		const messageBytes = Buffer.from(result.signedMessage, "base64");
		const sigBytes = Buffer.from(result.signature, "base64");
		expect(
			nacl.sign.detached.verify(
				messageBytes,
				sigBytes,
				kp.publicKey.toBytes(),
			),
		).toBe(true);
	});

	it("passes the cached authToken to authorize when supplied", async () => {
		const kp = Keypair.generate();
		const wallet = makeFakeWallet(kp);
		const transact = async <T,>(cb: TransactCb<T>): Promise<T> => cb(wallet);

		const mwa = createMwa(transact as never);
		await mwa.signIn(
			{ domain: "roam.dispatch", nonce: "n" },
			{ authToken: "cached-token" },
		);

		expect(wallet.authorize).toHaveBeenCalledWith(
			expect.objectContaining({ auth_token: "cached-token" }),
		);
	});

	it("throws SeekerProtocolError when the wallet returns no sign_in_result", async () => {
		const transact = async <T,>(
			cb: TransactCb<T>,
		): Promise<T> =>
			cb({
				authorize: vi.fn(async () => ({
					accounts: [{ address: "AAAAAA" }],
					auth_token: "t",
				})),
				signAndSendTransactions: vi.fn(),
			});
		const mwa = createMwa(transact as never);
		await expect(
			mwa.signIn({ domain: "roam.dispatch", nonce: "n" }),
		).rejects.toBeInstanceOf(SeekerProtocolError);
	});

	it("throws SeekerCancelledError when the wallet reports a cancellation", async () => {
		const transact = async () => {
			throw Object.assign(new Error("user cancelled"), {
				code: "ERROR_ASSOCIATION_CANCELLED",
			});
		};
		const mwa = createMwa(transact as never);
		await expect(
			mwa.signIn({ domain: "roam.dispatch", nonce: "n" }),
		).rejects.toBeInstanceOf(SeekerCancelledError);
	});

	it("throws SeekerProtocolError when transact is null (web/iOS)", async () => {
		const mwa = createMwa(null);
		expect(mwa.mwaAvailable).toBe(false);
		await expect(
			mwa.signIn({ domain: "roam.dispatch", nonce: "n" }),
		).rejects.toBeInstanceOf(SeekerProtocolError);
	});
});

describe("mwa.signAndSendTransaction", () => {
	it("authorizes silently with the supplied authToken and returns the base58 sig", async () => {
		const kp = Keypair.generate();
		const wallet = makeFakeWallet(kp);
		const transact = async <T,>(cb: TransactCb<T>): Promise<T> => cb(wallet);

		const mwa = createMwa(transact as never);
		const tx = new Transaction({
			feePayer: kp.publicKey,
			recentBlockhash: "11111111111111111111111111111111",
		});
		const sig = await mwa.signAndSendTransaction(tx, {
			authToken: "stored-token",
		});

		expect(sig).toBe("sig-base58-1");
		expect(wallet.authorize).toHaveBeenCalledWith(
			expect.objectContaining({ auth_token: "stored-token" }),
		);
		expect(wallet.signAndSendTransactions).toHaveBeenCalledWith({
			transactions: [tx],
		});
	});

	it("throws SeekerProtocolError when the wallet returns no signature", async () => {
		const kp = Keypair.generate();
		const transact = async <T,>(cb: TransactCb<T>): Promise<T> =>
			cb({
				authorize: vi.fn(async () => ({
					accounts: [{ address: "x" }],
					auth_token: "t",
				})),
				signAndSendTransactions: vi.fn(async () => []),
			} as never);

		const mwa = createMwa(transact as never);
		const tx = new Transaction({
			feePayer: kp.publicKey,
			recentBlockhash: "11111111111111111111111111111111",
		});
		await expect(
			mwa.signAndSendTransaction(tx, { authToken: "t" }),
		).rejects.toBeInstanceOf(SeekerProtocolError);
	});
});
