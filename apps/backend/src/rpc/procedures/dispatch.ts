import { randomUUID } from "node:crypto";
import { ORPCError } from "@orpc/server";
import type { Dispatch, DispatchResponse } from "@roam/shared";
import { computeBriefingHash } from "../../agent/runner.js";
import { BriefingModel } from "../../db/models/briefing.js";
import { DispatchModel } from "../../db/models/dispatch.js";
import { DispatchResponseModel } from "../../db/models/dispatchResponse.js";
import { IncidentModel } from "../../db/models/incident.js";
import { recordIncidentEvent } from "../../services/incidentEvents.js";
import { os } from "../builder.js";

const ACTIVE_STATUSES = ["pending", "claimed"] as const;
const ALL_STATUSES = [
	"pending",
	"claimed",
	"cleared",
	"expired",
	"cancelled",
] as const;

function serialize<T>(doc: T): T {
	return JSON.parse(JSON.stringify(doc)) as T;
}

function isDuplicateKeyError(err: unknown): boolean {
	return (
		typeof err === "object" &&
		err !== null &&
		"code" in err &&
		(err as { code?: number }).code === 11000
	);
}

export const dispatchRouter = {
	list: os.dispatch.list.handler(async ({ input }) => {
		const includeCleared = input?.includeCleared ?? false;
		const limit = input?.limit ?? 50;
		const statuses = includeCleared ? ALL_STATUSES : ACTIVE_STATUSES;
		const docs = await DispatchModel.find({ status: { $in: statuses } })
			.sort({ decidedAt: -1 })
			.limit(limit)
			.lean();
		return serialize(docs) as Dispatch[];
	}),

	get: os.dispatch.get.handler(async ({ input }) => {
		const dispatch = await DispatchModel.findById(input.id).lean();
		if (!dispatch) {
			throw new ORPCError("NOT_FOUND", {
				message: `Dispatch not found: ${input.id}`,
			});
		}
		const responses = await DispatchResponseModel.find({
			dispatchId: input.id,
		})
			.sort({ respondedAt: 1 })
			.lean();
		return serialize({ dispatch, responses }) as {
			dispatch: Dispatch;
			responses: DispatchResponse[];
		};
	}),

	confirm: os.dispatch.confirm.handler(async ({ input, context }) => {
		const briefing = await BriefingModel.findById(input.briefingId).lean();
		if (!briefing) {
			throw new ORPCError("NOT_FOUND", {
				message: `Briefing not found: ${input.briefingId}`,
			});
		}

		// Verify the briefing hash matches its canonicalized payload — guards
		// against a tampered or stale briefing being confirmed under a hash the
		// dispatcher already approved.
		const recomputedHash = computeBriefingHash({
			summary: briefing.summary,
			recommendedVehicleIds: briefing.recommendedVehicleIds,
			recommendedResponderIds: briefing.recommendedResponderIds,
			payout: briefing.payout,
		});
		if (recomputedHash !== briefing.briefingHash) {
			throw new ORPCError("CONFLICT", {
				message: "briefing_hash_mismatch",
			});
		}

		const incident = await IncidentModel.findById(briefing.incidentId).lean();
		if (!incident) {
			throw new ORPCError("NOT_FOUND", {
				message: `Incident not found: ${briefing.incidentId}`,
			});
		}

		const dispatchId = randomUUID();
		const now = new Date();
		const expiresAt = new Date(now.getTime() + input.expiresInSecs * 1000);

		await DispatchModel.create({
			_id: dispatchId,
			incidentId: briefing.incidentId,
			briefingId: briefing._id,
			decisionMaker: input.decisionMaker,
			decidedBy: input.decidedBy,
			decidedAt: now,
			assignedVehicleIds: briefing.recommendedVehicleIds,
			assignedResponderIds: briefing.recommendedResponderIds,
			payoutUsdc: briefing.payout.totalUsdc,
			requiredAccepts: input.requiredAccepts,
			status: "pending",
			claimedByResponderIds: [],
			expiresAt,
		});

		await IncidentModel.findByIdAndUpdate(briefing.incidentId, {
			status: "responding",
			dispatchedAt: now,
		});

		const persistedDispatch = await DispatchModel.findById(dispatchId).lean();
		if (!persistedDispatch) {
			// Unreachable — we just created it on the same connection.
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Dispatch vanished after create",
			});
		}
		const dispatch = serialize(persistedDispatch) as Dispatch;

		// Push fan-out — fire-and-forget so Confirm doesn't block on Expo.
		// Errors get logged but never crash the procedure.
		void context.pushClient
			.sendPushToResponders(briefing.recommendedResponderIds, {
				title: incident.classification?.incidentType ?? "Dispatch",
				body: briefing.summary,
				data: {
					type: "dispatch.created",
					dispatchId,
					payoutUsdc: briefing.payout.totalUsdc,
				},
			})
			.catch((err: unknown) => {
				context.log.error(
					{ err, dispatchId },
					"sendPushToResponders failed during dispatch.confirm",
				);
			});

		context.dispatchBroadcaster.broadcast({
			type: "dispatch.created",
			dispatch,
		});

		// One `dispatched` event per assigned responder. Fired after the dispatch
		// row is persisted so the event payload can carry the dispatch + briefing
		// references for the timeline UI.
		const eventDeps = {
			config: context.config,
			log: context.log,
			incidentBroadcaster: context.incidentBroadcaster,
		};
		await Promise.all(
			briefing.recommendedResponderIds.map((responderId) =>
				recordIncidentEvent(eventDeps, {
					incidentId: briefing.incidentId,
					kind: "dispatched",
					responderId,
					payload: { dispatchId, briefingId: briefing._id },
					occurredAt: now,
				}),
			),
		);

		return dispatch;
	}),

	respond: os.dispatch.respond.handler(async ({ input, context }) => {
		const existing = await DispatchModel.findById(input.dispatchId).lean();
		if (!existing) {
			throw new ORPCError("NOT_FOUND", {
				message: `Dispatch not found: ${input.dispatchId}`,
			});
		}

		let dispatchAfter: Dispatch;

		if (input.decision === "accept") {
			// Atomic claim: only if pending, not expired, not full, and this
			// responder isn't already in the claim list. The pipeline form lets
			// us $push and flip status='claimed' in one op so concurrent
			// accepts on requiredAccepts=1 can never both claim — the second
			// sees status='claimed' (or size>=requiredAccepts) and the filter
			// rejects.
			const claimed = await DispatchModel.findOneAndUpdate(
				{
					_id: input.dispatchId,
					status: "pending",
					expiresAt: { $gt: new Date() },
					claimedByResponderIds: { $ne: input.responderId },
					$expr: {
						$lt: [
							{ $size: "$claimedByResponderIds" },
							"$requiredAccepts",
						],
					},
				},
				[
					{
						$set: {
							claimedByResponderIds: {
								$concatArrays: [
									"$claimedByResponderIds",
									[input.responderId],
								],
							},
						},
					},
					{
						$set: {
							status: {
								$cond: [
									{
										$gte: [
											{ $size: "$claimedByResponderIds" },
											"$requiredAccepts",
										],
									},
									"claimed",
									"pending",
								],
							},
						},
					},
				],
				// `updatePipeline: true` opts the operation into aggregation
				// pipeline updates — required by Mongoose 9 to evaluate the
				// $size + $cond expressions against the *post-$push* state.
				{ new: true, updatePipeline: true },
			).lean();

			if (!claimed) {
				throw new ORPCError("CONFLICT", {
					message: "dispatch_already_claimed",
				});
			}
			dispatchAfter = serialize(claimed) as Dispatch;
		} else {
			// Decline: don't touch the dispatch document. Recording the
			// response on an expired or claimed dispatch is still fine — the
			// audit trail wants to know who said no.
			dispatchAfter = serialize(existing) as Dispatch;
		}

		const responseId = randomUUID();
		try {
			await DispatchResponseModel.create({
				_id: responseId,
				dispatchId: input.dispatchId,
				responderId: input.responderId,
				decision: input.decision,
				declineReason: input.declineReason,
				respondedAt: new Date(),
			});
		} catch (err) {
			if (isDuplicateKeyError(err)) {
				// The unique compound index on (dispatchId, responderId) caught
				// a duplicate. For accept, we already pushed the responder onto
				// claimedByResponderIds — pull them back so the chain stays
				// consistent. ($ne in the claim filter means each responder
				// appears at most once, so $pull only removes our addition.)
				if (input.decision === "accept") {
					await DispatchModel.findByIdAndUpdate(input.dispatchId, {
						$pull: { claimedByResponderIds: input.responderId },
					});
				}
				throw new ORPCError("CONFLICT", {
					message: "duplicate_response",
				});
			}
			throw err;
		}

		const persistedResponse = await DispatchResponseModel.findById(
			responseId,
		).lean();
		if (!persistedResponse) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "DispatchResponse vanished after create",
			});
		}
		const response = serialize(persistedResponse) as DispatchResponse;

		context.dispatchBroadcaster.broadcast({
			type: "dispatch.responded",
			dispatchId: input.dispatchId,
			response,
			dispatch: dispatchAfter,
		});

		await recordIncidentEvent(
			{
				config: context.config,
				log: context.log,
				incidentBroadcaster: context.incidentBroadcaster,
			},
			{
				incidentId: existing.incidentId,
				kind: input.decision === "accept" ? "accepted" : "rejected",
				responderId: input.responderId,
				payload: {
					dispatchId: input.dispatchId,
					...(input.decision === "decline" && input.declineReason
						? { declineReason: input.declineReason }
						: {}),
				},
				occurredAt: response.respondedAt as Date,
			},
		);

		return { response, dispatch: dispatchAfter };
	}),

	clear: os.dispatch.clear.handler(async ({ input, context }) => {
		// Only `claimed` dispatches can clear — pending hasn't been picked up,
		// expired/cancelled/cleared are terminal. Atomic transition guards
		// against double-clear races.
		const now = new Date();
		const cleared = await DispatchModel.findOneAndUpdate(
			{ _id: input.dispatchId, status: "claimed" },
			{ $set: { status: "cleared" } },
			{ new: true },
		).lean();

		if (!cleared) {
			const existing = await DispatchModel.findById(input.dispatchId).lean();
			if (!existing) {
				throw new ORPCError("NOT_FOUND", {
					message: `Dispatch not found: ${input.dispatchId}`,
				});
			}
			throw new ORPCError("CONFLICT", {
				message: `dispatch_not_claimable_for_clear: status=${existing.status}`,
			});
		}

		await IncidentModel.findByIdAndUpdate(cleared.incidentId, {
			status: "resolved",
			clearedAt: now,
		});

		const dispatch = serialize(cleared) as Dispatch;
		context.dispatchBroadcaster.broadcast({
			type: "dispatch.cleared",
			dispatch,
			clearedBy: input.clearedBy,
		});

		await recordIncidentEvent(
			{
				config: context.config,
				log: context.log,
				incidentBroadcaster: context.incidentBroadcaster,
			},
			{
				incidentId: cleared.incidentId,
				kind: "cleared",
				payload: { dispatchId: input.dispatchId },
				occurredAt: now,
			},
		);

		return dispatch;
	}),
};
