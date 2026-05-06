import { ORPCError } from "@orpc/server";
import { signSessionToken } from "../../auth/jwt.js";
import { verifyPin } from "../../auth/pin.js";
import { ResponderModel } from "../../db/models/responder.js";
import { serializeResponder } from "../../db/serializers/responder.js";
import { authed, os } from "../builder.js";

// Procedures that handle the responder session itself. Named `sessionAuthRouter`
// to avoid colliding with the existing checkin/checkout `authRouter`, which
// authenticates a responder *into a vehicle*. The two routers are mounted side
// by side under the `auth` namespace in the contract.

export const sessionAuthRouter = {
	signIn: os.auth.signIn.handler(async ({ input, context }) => {
		const { config, log } = context;
		const responder = await ResponderModel.findOne({
			name: input.name,
		}).select("+pinHash");

		if (!responder || !responder.pinHash) {
			// Same error shape for unknown name and missing-PIN. Don't leak which
			// names exist — anyone on the same Wi-Fi as the dev server otherwise
			// gets a free name-enumeration oracle.
			log.info({ name: input.name }, "auth.signIn: rejected");
			throw new ORPCError("UNAUTHORIZED", {
				message: "Invalid name or PIN",
			});
		}

		const ok = await verifyPin(input.pin, responder.pinHash);
		if (!ok) {
			log.info(
				{ name: input.name, responderId: responder._id },
				"auth.signIn: bad PIN",
			);
			throw new ORPCError("UNAUTHORIZED", {
				message: "Invalid name or PIN",
			});
		}

		const token = await signSessionToken(
			{ sub: responder._id, name: responder.name, role: responder.role },
			config.AUTH_SECRET,
			config.AUTH_TOKEN_TTL_SECS,
		);

		log.info(
			{ responderId: responder._id, name: responder.name },
			"auth.signIn: ok",
		);
		// serializeResponder strips pinHash defensively — no need to re-fetch
		// the responder without the +pinHash select to keep the hash off the wire.
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
};
