import { randomUUID } from "node:crypto";
import { ORPCError } from "@orpc/server";
import { ResponderModel } from "../../db/models/responder.js";
import { serializeResponder } from "../../db/serializers/responder.js";
import { authed, os } from "../builder.js";

export const respondersRouter = {
	list: os.responders.list.handler(async () => {
		const responders = await ResponderModel.find().lean();
		return responders.map(serializeResponder);
	}),

	enrol: os.responders.enrol.handler(async ({ input, context }) => {
		const { name, role, availability } = input;
		const { walletProvider, log } = context;

		const upserted = await ResponderModel.findOneAndUpdate(
			{ name },
			{
				$set: { role, availability },
				$setOnInsert: { _id: randomUUID(), name },
			},
			{ upsert: true, returnDocument: "after" },
		);

		try {
			await walletProvider.createWallet(upserted._id);
		} catch (err) {
			log.error(
				{ err, responderId: upserted._id },
				"enrol: walletProvider.createWallet failed",
			);
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Failed to provision responder wallet",
			});
		}

		const responder = await ResponderModel.findById(upserted._id).lean();
		if (!responder) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Responder vanished after enrol",
			});
		}

		return { responder: serializeResponder(responder) };
	}),

	upsertPushToken: authed.responders.upsertPushToken.handler(
		async ({ input, context }) => {
			const { token } = input;
			const responderId = context.user.id;
			const { log } = context;

			const result = await ResponderModel.findByIdAndUpdate(
				responderId,
				{ $addToSet: { pushTokens: token } },
				{ returnDocument: "after", projection: { pushTokens: 1 } },
			).lean();

			if (!result) {
				throw new ORPCError("NOT_FOUND", {
					message: `Responder ${responderId} not found`,
				});
			}

			const tokenCount = result.pushTokens?.length ?? 0;
			log.info(
				{ responderId, tokenCount },
				"upsertPushToken: registered push token",
			);
			return { tokenCount };
		},
	),
};
