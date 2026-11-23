import { ORPCError } from "@orpc/server";
import {
	RESPONDER_ALREADY_BOUND,
	ResponderSchema,
	WALLET_UNBOUND,
} from "@roam/shared";
import { PublicKey } from "@solana/web3.js";
import { signSessionToken } from "../../auth/jwt.js";
import {
	consumeNonce,
	issueNonce,
	parseSiwsNonce,
	SIWS_DOMAIN,
	SIWS_STATEMENT,
	verifySiwsSignature,
} from "../../auth/siws.js";
import { ResponderModel } from "../../db/models/responder.js";
import { toWire } from "../../db/serializers/wire.js";
import { authed, os } from "../builder.js";

export const sessionAuthRouter = {
	siwsChallenge: os.auth.siwsChallenge.handler(async () => {
		const { nonce, expiresAt } = issueNonce();
		return {
			nonce,
			domain: SIWS_DOMAIN,
			statement: SIWS_STATEMENT,
			expiresAt: expiresAt.toISOString(),
		};
	}),

	siwsVerify: os.auth.siwsVerify.handler(async ({ input, context }) => {
		const { config, log } = context;

		let messageBytes: Uint8Array;
		let sigBytes: Uint8Array;
		let address: string;
		try {
			messageBytes = Buffer.from(input.signedMessage, "base64");
			sigBytes = Buffer.from(input.signature, "base64");
			address = new PublicKey(Buffer.from(input.address, "base64")).toBase58();
		} catch {
			throw new ORPCError("UNAUTHORIZED", { message: "Invalid encoding" });
		}

		if (!verifySiwsSignature(messageBytes, sigBytes, address)) {
			log.info({ address }, "auth.siwsVerify: bad sig");
			throw new ORPCError("UNAUTHORIZED", { message: "Bad signature" });
		}

		const nonce = parseSiwsNonce(messageBytes);
		if (!nonce) {
			throw new ORPCError("UNAUTHORIZED", { message: "Missing nonce" });
		}

		// Consume only after the signature check so forged probes can't burn nonces.
		if (!consumeNonce(nonce)) {
			log.info({ address }, "auth.siwsVerify: bad nonce");
			throw new ORPCError("UNAUTHORIZED", {
				message: "Invalid or replayed nonce",
			});
		}

		let responder = await ResponderModel.findOne({ walletAddress: address });

		if (!responder) {
			if (!input.name) {
				throw new ORPCError("UNAUTHORIZED", { message: WALLET_UNBOUND });
			}
			responder = await ResponderModel.findOneAndUpdate(
				{ name: input.name, walletAddress: null },
				{ $set: { walletAddress: address } },
				{ returnDocument: "after" },
			);
			if (!responder) {
				const named = await ResponderModel.exists({ name: input.name });
				log.info(
					{ name: input.name, address, named: Boolean(named) },
					"auth.siwsVerify: name not bindable",
				);
				throw named
					? new ORPCError("CONFLICT", { message: RESPONDER_ALREADY_BOUND })
					: new ORPCError("UNAUTHORIZED", { message: "Unknown responder" });
			}
		}

		const token = await signSessionToken(
			{ sub: responder._id, name: responder.name, role: responder.role },
			config.AUTH_SECRET,
			config.AUTH_TOKEN_TTL_SECS,
		);

		log.info(
			{ responderId: responder._id, name: responder.name, address },
			"auth.siwsVerify: ok",
		);
		return { token, responder: toWire(ResponderSchema, responder) };
	}),

	me: authed.auth.me.handler(async ({ context }) => {
		const responder = await ResponderModel.findById(context.user.id).lean();
		if (!responder) {
			throw new ORPCError("UNAUTHORIZED", {
				message: "Responder no longer exists",
			});
		}
		return { responder: toWire(ResponderSchema, responder) };
	}),

	refresh: authed.auth.refresh.handler(async ({ context }) => {
		const { config } = context;
		const responder = await ResponderModel.findById(context.user.id).lean();
		if (!responder) {
			throw new ORPCError("UNAUTHORIZED", {
				message: "Responder no longer exists",
			});
		}
		const token = await signSessionToken(
			{ sub: responder._id, name: responder.name, role: responder.role },
			config.AUTH_SECRET,
			config.AUTH_TOKEN_TTL_SECS,
		);
		return { token, responder: toWire(ResponderSchema, responder) };
	}),
};
