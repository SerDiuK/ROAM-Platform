import { ORPCError } from "@orpc/server";
import { IncidentEventSchema } from "@roam/shared";
import { IncidentEventModel } from "../../db/models/incidentEvent.js";
import { toWire } from "../../db/serializers/wire.js";
import { authed, os } from "../builder.js";

const RESPONDER_LIMIT = 50;

export const eventsRouter = {
	listByIncident: os.events.listByIncident.handler(async ({ input }) => {
		const docs = await IncidentEventModel.find({ incidentId: input.incidentId })
			.sort({ occurredAt: 1 })
			.lean();
		return docs.map((doc) => toWire(IncidentEventSchema, doc));
	}),

	listForResponder: authed.events.listForResponder.handler(
		async ({ context }) => {
			if (!context.user) {
				throw new ORPCError("UNAUTHORIZED", {
					message: "Sign in to view your events",
				});
			}
			const mine = await IncidentEventModel.find({
				responderId: context.user.id,
			})
				.sort({ occurredAt: -1 })
				.limit(RESPONDER_LIMIT)
				.lean();

			const incidentIds = Array.from(new Set(mine.map((e) => e.incidentId)));
			const incidentScoped = incidentIds.length
				? await IncidentEventModel.find({
						incidentId: { $in: incidentIds },
						responderId: null,
					})
						.sort({ occurredAt: -1 })
						.lean()
				: [];

			const merged = [...mine, ...incidentScoped].sort(
				(a, b) => b.occurredAt.getTime() - a.occurredAt.getTime(),
			);
			return merged.map((doc) => toWire(IncidentEventSchema, doc));
		},
	),
};
