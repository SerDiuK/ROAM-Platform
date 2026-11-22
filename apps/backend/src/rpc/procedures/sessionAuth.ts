import { ORPCError } from "@orpc/server";
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
import { serializeResponder } from "../../db/serializers/responder.js";
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
				// Mobile matches this exact message to show its name picker.
				throw new ORPCError("UNAUTHORIZED", {
					message: "WALLET_UNBOUND",
					data: { error: "wallet_unbound" as const },
				});
			}
			responder = await ResponderModel.findOne({ name: input.name });
			if (!responder) {
				log.info(
					{ name: input.name, address },
					"auth.siwsVerify: name not found",
				);
				throw new ORPCError("UNAUTHORIZED", {
					message: "Unknown responder",
				});
			}
			responder.walletAddress = address;
			await responder.save();
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
		return { token, responder: serializeResponder(responder.toObject()) };
	}),

	me: authed.auth.me.handler(async ({ context }) => {
		const responder = await ResponderModel.findById(context.user.id).lean();
		if (!responder) {
			throw new ORPCError("UNAUTHORIZED", {
				message: "Responder no longer exists",
			});
		}
		return { responder: serializeResponder(responder) };
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
		return { token, responder: serializeResponder(responder) };
	}),
};
