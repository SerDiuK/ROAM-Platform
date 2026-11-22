import { call } from "@orpc/server";
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import { afterEach, describe, expect, it } from "vitest";
import {
	makeFakeBroadcaster,
	makeFakeLogger,
	makeResponder,
} from "../../../test/factories.js";
import { __resetNonceStoreForTests } from "../../auth/siws.js";
import type { Config } from "../../config.js";
import { ResponderModel } from "../../db/models/responder.js";
import type { AuthedUser, RpcContext } from "../context.js";
import { sessionAuthRouter } from "./sessionAuth.js";

const SECRET = "0".repeat(64);
const TTL = 3600;

const fakeConfig = {
	AUTH_SECRET: SECRET,
	AUTH_TOKEN_TTL_SECS: TTL,
	SOLANA_CLUSTER: "devnet",
} as unknown as Config;

function buildContext(user: AuthedUser | null = null): RpcContext {
	return {
		config: fakeConfig,
		incidentBroadcaster:
			makeFakeBroadcaster() as unknown as RpcContext["incidentBroadcaster"],
		dispatchBroadcaster:
			makeFakeBroadcaster() as unknown as RpcContext["dispatchBroadcaster"],
		walletProvider: {} as RpcContext["walletProvider"],
		transcriber: {} as RpcContext["transcriber"],
		anthropic: {} as RpcContext["anthropic"],
		pushClient: {} as RpcContext["pushClient"],
		log: makeFakeLogger() as unknown as RpcContext["log"],
		user,
	};
}

async function challenge(): Promise<{
	nonce: string;
	domain: string;
	statement: string;
}> {
	return call(sessionAuthRouter.siwsChallenge, {}, { context: buildContext() });
}

function signSiws(args: {
	kp: Keypair;
	nonce: string;
	domain: string;
	statement: string;
	pubkeyOverride?: string;
}): {
	signedMessage: string;
	signature: string;
	address: string;
	rawMessage: string;
} {
	const pubkey = args.pubkeyOverride ?? args.kp.publicKey.toBase58();
	const rawMessage = [
		`${args.domain} wants you to sign in with your Solana account:`,
		pubkey,
		"",
		args.statement,
		"",
		`Nonce: ${args.nonce}`,
	].join("\n");
	const messageBytes = new TextEncoder().encode(rawMessage);
	const sig = nacl.sign.detached(messageBytes, args.kp.secretKey);
	return {
		signedMessage: Buffer.from(messageBytes).toString("base64"),
		signature: Buffer.from(sig).toString("base64"),
		address: Buffer.from(args.kp.publicKey.toBytes()).toString("base64"),
		rawMessage,
	};
}

afterEach(() => {
	__resetNonceStoreForTests();
});

describe("auth.siwsChallenge", () => {
	it("returns a fresh nonce + domain + statement per call", async () => {
		const a = await challenge();
		const b = await challenge();
		expect(a.nonce).not.toBe(b.nonce);
		expect(a.domain).toBe("roam.dispatch");
		expect(a.statement).toBe("Sign in to ROAM Dispatch.");
	});
});

describe("auth.siwsVerify", () => {
	it("binds walletAddress and issues a JWT on first sign-in (name supplied)", async () => {
		const op = await makeResponder({ name: "ALPHA-1" });
		const kp = Keypair.generate();
		const c = await challenge();
		const { signedMessage, signature, address } = signSiws({
			kp,
			nonce: c.nonce,
			domain: c.domain,
			statement: c.statement,
		});

		const result = await call(
			sessionAuthRouter.siwsVerify,
			{ signedMessage, signature, address, name: "ALPHA-1" },
			{ context: buildContext() },
		);

		expect(result.token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
		expect(result.responder._id).toBe(op._id);
		expect(result.responder.walletAddress).toBe(kp.publicKey.toBase58());

		const fresh = await ResponderModel.findById(op._id).lean();
		expect(fresh?.walletAddress).toBe(kp.publicKey.toBase58());
	});

	it("resolves by walletAddress on subsequent sign-ins (name ignored)", async () => {
		const op = await makeResponder({ name: "ALPHA-2" });
		const kp = Keypair.generate();
		await ResponderModel.findByIdAndUpdate(op._id, {
			walletAddress: kp.publicKey.toBase58(),
		});

		const c = await challenge();
		const { signedMessage, signature, address } = signSiws({
			kp,
			nonce: c.nonce,
			domain: c.domain,
			statement: c.statement,
		});

		const result = await call(
			sessionAuthRouter.siwsVerify,
			{ signedMessage, signature, address },
			{ context: buildContext() },
		);

		expect(result.responder._id).toBe(op._id);
	});

	it("returns WALLET_UNBOUND when an unknown pubkey signs without a name", async () => {
		const kp = Keypair.generate();
		const c = await challenge();
		const { signedMessage, signature, address } = signSiws({
			kp,
			nonce: c.nonce,
			domain: c.domain,
			statement: c.statement,
		});

		await expect(
			call(
				sessionAuthRouter.siwsVerify,
				{ signedMessage, signature, address },
				{ context: buildContext() },
			),
		).rejects.toMatchObject({
			code: "UNAUTHORIZED",
			message: "WALLET_UNBOUND",
		});
	});

	it("rejects an unknown name on first sign-in", async () => {
		const kp = Keypair.generate();
		const c = await challenge();
		const { signedMessage, signature, address } = signSiws({
			kp,
			nonce: c.nonce,
			domain: c.domain,
			statement: c.statement,
		});

		await expect(
			call(
				sessionAuthRouter.siwsVerify,
				{ signedMessage, signature, address, name: "GHOST" },
				{ context: buildContext() },
			),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});

	it("rejects a tampered message (signature no longer valid)", async () => {
		const kp = Keypair.generate();
		const c = await challenge();
		const signed = signSiws({
			kp,
			nonce: c.nonce,
			domain: c.domain,
			statement: c.statement,
		});
		const tamperedRaw = signed.rawMessage.replace(c.nonce, "forged");
		const tamperedB64 = Buffer.from(tamperedRaw).toString("base64");

		await expect(
			call(
				sessionAuthRouter.siwsVerify,
				{
					signedMessage: tamperedB64,
					signature: signed.signature,
					address: signed.address,
					name: "ALPHA-3",
				},
				{ context: buildContext() },
			),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});

	it("rejects a replayed nonce on the second call", async () => {
		await makeResponder({ name: "ALPHA-4" });
		const kp = Keypair.generate();
		const c = await challenge();
		const signed = signSiws({
			kp,
			nonce: c.nonce,
			domain: c.domain,
			statement: c.statement,
		});

		await call(
			sessionAuthRouter.siwsVerify,
			{ ...signed, name: "ALPHA-4" },
			{ context: buildContext() },
		);

		await expect(
			call(
				sessionAuthRouter.siwsVerify,
				{
					signedMessage: signed.signedMessage,
					signature: signed.signature,
					address: signed.address,
				},
				{ context: buildContext() },
			),
		).rejects.toMatchObject({
			code: "UNAUTHORIZED",
			message: "Invalid or replayed nonce",
		});
	});

	it("rejects a signature from a different keypair than the message address", async () => {
		const claimed = Keypair.generate();
		const actual = Keypair.generate();
		const c = await challenge();
		const signed = signSiws({
			kp: actual,
			nonce: c.nonce,
			domain: c.domain,
			statement: c.statement,
			pubkeyOverride: claimed.publicKey.toBase58(),
		});
		const claimedAddress = Buffer.from(claimed.publicKey.toBytes()).toString(
			"base64",
		);

		await expect(
			call(
				sessionAuthRouter.siwsVerify,
				{
					signedMessage: signed.signedMessage,
					signature: signed.signature,
					address: claimedAddress,
					name: "ALPHA-5",
				},
				{ context: buildContext() },
			),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});
});

describe("auth.me", () => {
	it("returns the responder resolved from ctx.user", async () => {
		const op = await makeResponder({ name: "ALPHA-6" });
		const result = await call(sessionAuthRouter.me, undefined as never, {
			context: buildContext({
				id: op._id,
				name: op.name,
				role: "responder",
			}),
		});
		expect(result.responder._id).toBe(op._id);
	});

	it("rejects when no user in context", async () => {
		await expect(
			call(sessionAuthRouter.me, undefined as never, {
				context: buildContext(null),
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});

	it("rejects when the responder no longer exists", async () => {
		await expect(
			call(sessionAuthRouter.me, undefined as never, {
				context: buildContext({
					id: "ghost-id",
					name: "GHOST",
					role: "responder",
				}),
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});
});
