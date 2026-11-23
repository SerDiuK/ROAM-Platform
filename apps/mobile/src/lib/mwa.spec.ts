import { Keypair, Transaction } from "@solana/web3.js";
import nacl from "tweetnacl";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
	Platform: { OS: "ios" },
}));

const {
	SeekerAuthorizationError,
	SeekerCancelledError,
	SeekerSigningError,
	createMwa,
} = await import("./mwa.js");

type Transact = NonNullable<Parameters<typeof createMwa>[0]>;
type Wallet = Parameters<Parameters<Transact>[0]>[0];

function transactWith(wallet: Wallet): Transact {
	return async (callback) => callback(wallet);
}

function authorization(authToken: string) {
	return {
		accounts: [{ address: "AAAAAA" }],
		auth_token: authToken,
		wallet_uri_base: "https://wallet.example",
	};
}

function makeFakeWallet(kp: Keypair) {
	const addressB64 = Buffer.from(kp.publicKey.toBytes()).toString("base64");
	return {
		authorize: vi.fn(async (params: Parameters<Wallet["authorize"]>[0]) => {
			if (!params.sign_in_payload) return authorization("auth-token-1");
			const body = [
				`${params.sign_in_payload.domain} wants you to sign in with your Solana account:`,
				kp.publicKey.toBase58(),
				"",
				params.sign_in_payload.statement ?? "",
				"",
				`Nonce: ${params.sign_in_payload.nonce ?? ""}`,
			].join("\n");
			const bytes = new TextEncoder().encode(body);
			const sig = nacl.sign.detached(bytes, kp.secretKey);
			return {
				...authorization("auth-token-1"),
				sign_in_result: {
					address: addressB64,
					signed_message: Buffer.from(bytes).toString("base64"),
					signature: Buffer.from(sig).toString("base64"),
				},
			};
		}),
		signAndSendTransactions: vi.fn(async () => ["sig-base58-1"]),
	};
}

function makeTx(): Transaction {
	return new Transaction({
		feePayer: Keypair.generate().publicKey,
		recentBlockhash: "11111111111111111111111111111111",
	});
}

describe("mwa.signIn", () => {
	it("returns the sign_in_result triple decoded + the auth_token", async () => {
		const kp = Keypair.generate();
		const mwa = createMwa(transactWith(makeFakeWallet(kp)));
		const result = await mwa.signIn({
			domain: "roam.dispatch",
			statement: "Sign in.",
			nonce: "n-1",
		});

		expect(result.address).toBe(kp.publicKey.toBase58());
		expect(result.authToken).toBe("auth-token-1");

		const messageBytes = Buffer.from(result.signedMessage, "base64");
		const sigBytes = Buffer.from(result.signature, "base64");
		expect(
			nacl.sign.detached.verify(messageBytes, sigBytes, kp.publicKey.toBytes()),
		).toBe(true);
	});

	it("passes the cached authToken to authorize when supplied", async () => {
		const wallet = makeFakeWallet(Keypair.generate());
		const mwa = createMwa(transactWith(wallet));
		await mwa.signIn(
			{ domain: "roam.dispatch", nonce: "n" },
			{ authToken: "cached-token" },
		);

		expect(wallet.authorize).toHaveBeenCalledWith(
			expect.objectContaining({ auth_token: "cached-token" }),
		);
	});

	it("throws SeekerAuthorizationError when the wallet returns no sign_in_result", async () => {
		const mwa = createMwa(
			transactWith({
				authorize: vi.fn(async () => authorization("t")),
				signAndSendTransactions: vi.fn(),
			}),
		);
		await expect(
			mwa.signIn({ domain: "roam.dispatch", nonce: "n" }),
		).rejects.toBeInstanceOf(SeekerAuthorizationError);
	});

	it("throws SeekerCancelledError when the wallet reports a cancellation", async () => {
		const transact = async () => {
			throw Object.assign(new Error("user cancelled"), {
				code: "ERROR_ASSOCIATION_CANCELLED",
			});
		};
		const mwa = createMwa(transact);
		await expect(
			mwa.signIn({ domain: "roam.dispatch", nonce: "n" }),
		).rejects.toBeInstanceOf(SeekerCancelledError);
	});

	it("throws SeekerAuthorizationError when transact is null (web/iOS)", async () => {
		const mwa = createMwa(null);
		expect(mwa.mwaAvailable).toBe(false);
		await expect(
			mwa.signIn({ domain: "roam.dispatch", nonce: "n" }),
		).rejects.toBeInstanceOf(SeekerAuthorizationError);
	});
});

describe("mwa.signAndSendTransaction", () => {
	it("authorizes silently with the supplied authToken and returns the sig with the wallet's auth token", async () => {
		const wallet = makeFakeWallet(Keypair.generate());
		const mwa = createMwa(transactWith(wallet));
		const tx = makeTx();
		const signed = await mwa.signAndSendTransaction(tx, {
			authToken: "stored-token",
		});

		expect(signed).toEqual({
			signature: "sig-base58-1",
			authToken: "auth-token-1",
		});
		expect(wallet.authorize).toHaveBeenCalledWith(
			expect.objectContaining({ auth_token: "stored-token" }),
		);
		expect(wallet.signAndSendTransactions).toHaveBeenCalledWith({
			transactions: [tx],
		});
	});

	it("re-authorizes a stale authToken, but not a cancelled one", async () => {
		const stale = makeFakeWallet(Keypair.generate());
		stale.authorize.mockRejectedValueOnce(new Error("auth_token not valid"));
		const signed = await createMwa(transactWith(stale)).signAndSendTransaction(
			makeTx(),
			{ authToken: "stale-token" },
		);

		expect(signed.authToken).toBe("auth-token-1");
		expect(stale.authorize).toHaveBeenCalledTimes(2);

		const cancelled = makeFakeWallet(Keypair.generate());
		cancelled.authorize.mockRejectedValueOnce(new Error("User cancelled"));
		await expect(
			createMwa(transactWith(cancelled)).signAndSendTransaction(makeTx(), {
				authToken: "stored-token",
			}),
		).rejects.toBeInstanceOf(SeekerCancelledError);
		expect(cancelled.authorize).toHaveBeenCalledTimes(1);
	});

	it("raises SeekerAuthorizationError only when the wallet refuses to authorize", async () => {
		const declined = makeFakeWallet(Keypair.generate());
		declined.signAndSendTransactions.mockRejectedValueOnce(
			new Error("Transaction declined"),
		);
		await expect(
			createMwa(transactWith(declined)).signAndSendTransaction(makeTx(), {
				authToken: "stored-token",
			}),
		).rejects.toBeInstanceOf(SeekerSigningError);

		const refused = makeFakeWallet(Keypair.generate());
		refused.authorize.mockRejectedValue(new Error("Authorization failed"));
		await expect(
			createMwa(transactWith(refused)).signAndSendTransaction(makeTx(), {
				authToken: "stored-token",
			}),
		).rejects.toBeInstanceOf(SeekerAuthorizationError);
	});

	it("throws SeekerSigningError when the wallet returns no signature", async () => {
		const mwa = createMwa(
			transactWith({
				authorize: vi.fn(async () => authorization("t")),
				signAndSendTransactions: vi.fn(async () => []),
			}),
		);
		await expect(
			mwa.signAndSendTransaction(makeTx(), { authToken: "t" }),
		).rejects.toBeInstanceOf(SeekerSigningError);
	});
});
