import { ORPCError } from "@orpc/server";
import type { IncidentEvent } from "@roam/shared";
import { Types } from "mongoose";
import { IncidentEventModel } from "../../db/models/incidentEvent.js";
import { authed, os } from "../builder.js";

const RESPONDER_LIMIT = 50;

function stripNulls<T extends object>(obj: T): T {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(obj)) {
		if (v !== null) out[k] = v;
	}
	return out as T;
}

function toWire(doc: Record<string, unknown> & { _id: unknown }): IncidentEvent {
	const id =
		doc._id instanceof Types.ObjectId
			? doc._id.toHexString()
			: String(doc._id);
	const payload = doc.payload && typeof doc.payload === "object"
		? (stripNulls(doc.payload as Record<string, unknown>) as IncidentEvent["payload"])
		: undefined;
	return {
		_id: id,
		incidentId: doc.incidentId as string,
		kind: doc.kind as IncidentEvent["kind"],
		responderId: (doc.responderId as string | null | undefined) ?? null,
		occurredAt: doc.occurredAt as Date,
		payload,
		solanaTxSignature:
			(doc.solanaTxSignature as string | null | undefined) ?? undefined,
	};
}

export const eventsRouter = {
	// Dispatcher view — full timeline for one incident, oldest first so the UI
	// can render top-to-bottom chronologically without re-sorting.
	listByIncident: os.events.listByIncident.handler(async ({ input }) => {
		const docs = await IncidentEventModel.find({ incidentId: input.incidentId })
			.sort({ occurredAt: 1 })
			.lean();
		return docs.map(toWire);
	}),

	// Mobile responder view — events tied to the signed-in responder, plus the
	// incident-scoped events (received / cleared) for incidents this responder
	// has any other event on. Two-step query: pick the responder's events,
	// derive the incident set, fetch incident-scoped events for that set.
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
			return merged.map(toWire);
		},
	),
};
