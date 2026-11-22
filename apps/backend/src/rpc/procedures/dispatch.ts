import { createHash, randomUUID } from "node:crypto";
import { ORPCError } from "@orpc/server";
import type { Dispatch, DispatchResponse } from "@roam/shared";
import { buildRecordEventTx, partialSignAsFeePayer } from "@roam/solana-client";
import { PublicKey } from "@solana/web3.js";
import { computeBriefingHash } from "../../agent/runner.js";
import { BriefingModel } from "../../db/models/briefing.js";
import { DispatchModel } from "../../db/models/dispatch.js";
import { DispatchResponseModel } from "../../db/models/dispatchResponse.js";
import { IncidentModel } from "../../db/models/incident.js";
import { ResponderModel } from "../../db/models/responder.js";
import {
	responderIdHash as hashResponderId,
	incidentIdToBytes,
	recordIncidentEvent,
	recordIncidentEventWithSignature,
} from "../../services/incidentEvents.js";
import { getSolanaContext } from "../../services/solana.js";
import { triggerX402Payment } from "../../x402/client.js";
import { authed, os } from "../builder.js";
import type { RpcContext } from "../context.js";

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

// One atomic update, so concurrent accepts can't over-claim.
async function claimDispatch(
	dispatchId: string,
	responderId: string,
): Promise<Dispatch | null> {
	const claimed = await DispatchModel.findOneAndUpdate(
		{
			_id: dispatchId,
			status: "pending",
			expiresAt: { $gt: new Date() },
			claimedByResponderIds: { $ne: responderId },
			$expr: {
				$lt: [{ $size: "$claimedByResponderIds" }, "$requiredAccepts"],
			},
		},
		[
			{
				$set: {
					claimedByResponderIds: {
						$concatArrays: ["$claimedByResponderIds", [responderId]],
					},
				},
			},
			{
				$set: {
					status: {
						$cond: [
							{
								$gte: [{ $size: "$claimedByResponderIds" }, "$requiredAccepts"],
							},
							"claimed",
							"pending",
						],
					},
				},
			},
		],
		{ new: true, updatePipeline: true },
	).lean();
	return claimed ? (serialize(claimed) as Dispatch) : null;
}

function dispatchEventPayloadHash(args: {
	dispatchId: string;
	decision: "accept" | "decline";
	declineReason?: string;
}): Uint8Array {
	const canonical = JSON.stringify({
		decision: args.decision,
		declineReason: args.declineReason ?? "",
		dispatchId: args.dispatchId,
	});
	return Uint8Array.from(createHash("sha256").update(canonical).digest());
}

function dispatchClearPayloadHash(args: { dispatchId: string }): Uint8Array {
	const canonical = JSON.stringify({ dispatchId: args.dispatchId });
	return Uint8Array.from(createHash("sha256").update(canonical).digest());
}

// `cleared` is incident-scoped: a zero responder hash gives one cleared PDA per incident.
const ZERO_RESPONDER_HASH = new Uint8Array(32);

function notifyDispatchedResponders(
	context: RpcContext,
	args: {
		dispatchId: string;
		responderIds: string[];
		title: string;
		body: string;
		payoutUsdc: number;
	},
): void {
	void context.pushClient
		.sendPushToResponders(args.responderIds, {
			title: args.title,
			body: args.body,
			data: {
				type: "dispatch.created",
				dispatchId: args.dispatchId,
				payoutUsdc: args.payoutUsdc,
			},
		})
		.catch((err: unknown) => {
			context.log.error(
				{ err, dispatchId: args.dispatchId },
				"notifyDispatchedResponders failed",
			);
		});
}

// Non-blocking: the clear must succeed regardless of the payment outcome.
function settleDispatchPayment(context: RpcContext, dispatchId: string): void {
	void triggerX402Payment(context.config, context.log, dispatchId).catch(
		(err: unknown) => {
			context.log.error(
				{ err, dispatchId },
				"settleDispatchPayment failed (non-blocking)",
			);
		},
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
			assigned: {
				vehicles: briefing.recommendedVehicleIds,
				responders: briefing.recommendedResponderIds,
			},
		});

		const persistedDispatch = await DispatchModel.findById(dispatchId).lean();
		if (!persistedDispatch) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Dispatch vanished after create",
			});
		}
		const dispatch = serialize(persistedDispatch) as Dispatch;

		notifyDispatchedResponders(context, {
			dispatchId,
			responderIds: briefing.recommendedResponderIds,
			title: incident.classification?.incidentType ?? "Dispatch",
			body: briefing.summary,
			payoutUsdc: briefing.payout.totalUsdc,
		});

		context.dispatchBroadcaster.broadcast({
			type: "dispatch.created",
			dispatch,
		});

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

	prepareResponseTx: authed.dispatch.prepareResponseTx.handler(
		async ({ input, context }) => {
			const dispatch = await DispatchModel.findById(input.dispatchId).lean();
			if (!dispatch) {
				throw new ORPCError("NOT_FOUND", {
					message: `Dispatch not found: ${input.dispatchId}`,
				});
			}
			// Reject an unclaimable accept before mobile asks for a fingerprint.
			// Declines of expired or claimed dispatches still go on the audit trail.
			if (input.decision === "accept") {
				if (dispatch.status !== "pending") {
					throw new ORPCError("CONFLICT", {
						message: "dispatch_already_claimed",
					});
				}
				if (dispatch.expiresAt.getTime() < Date.now()) {
					throw new ORPCError("CONFLICT", { message: "dispatch_expired" });
				}
				if (dispatch.claimedByResponderIds.includes(context.user.id)) {
					throw new ORPCError("CONFLICT", { message: "duplicate_response" });
				}
			}

			const responder = await ResponderModel.findById(context.user.id).lean();
			if (!responder?.walletAddress) {
				throw new ORPCError("UNAUTHORIZED", {
					message: "wallet_not_bound",
					data: { error: "wallet_not_bound" as const },
				});
			}

			const { connection, operator } = getSolanaContext(context.config);

			const hmacKey = context.config.CHAIN_HMAC_KEY;
			const incidentId = incidentIdToBytes(dispatch.incidentId, hmacKey);
			const responderHash = hashResponderId(context.user.id, hmacKey);
			const payloadHash = dispatchEventPayloadHash({
				dispatchId: input.dispatchId,
				decision: input.decision,
				declineReason: input.declineReason,
			});

			let attestor: PublicKey;
			try {
				attestor = new PublicKey(responder.walletAddress);
			} catch {
				throw new ORPCError("UNAUTHORIZED", {
					message: "wallet_address_invalid",
				});
			}

			const occurredAt = Math.floor(Date.now() / 1000);
			const { transaction } = await buildRecordEventTx(
				{
					connection,
					incidentId,
					kind: input.decision === "accept" ? "accepted" : "rejected",
					responderIdHash: responderHash,
					payloadHash,
					occurredAt,
					attestorPubkey: attestor,
					feePayerPubkey: operator.publicKey,
				},
				operator,
			);
			partialSignAsFeePayer(transaction, operator);

			const serialized = transaction
				.serialize({ requireAllSignatures: false, verifySignatures: false })
				.toString("base64");

			// A blockhash is valid for 150 blocks, roughly 60–90 s.
			const expiresAt = new Date(Date.now() + 60_000).toISOString();
			return {
				serializedTx: serialized,
				recentBlockhash: transaction.recentBlockhash ?? "",
				expiresAt,
			};
		},
	),

	commitSignedResponse: authed.dispatch.commitSignedResponse.handler(
		async ({ input, context }) => {
			const existing = await DispatchModel.findById(input.dispatchId).lean();
			if (!existing) {
				throw new ORPCError("NOT_FOUND", {
					message: `Dispatch not found: ${input.dispatchId}`,
				});
			}

			const responder = await ResponderModel.findById(context.user.id).lean();
			if (!responder?.walletAddress) {
				throw new ORPCError("UNAUTHORIZED", {
					message: "wallet_not_bound",
				});
			}

			let dispatchAfter: Dispatch;
			if (input.decision === "accept") {
				const claimed = await claimDispatch(input.dispatchId, context.user.id);
				if (!claimed) {
					throw new ORPCError("CONFLICT", {
						message: "dispatch_already_claimed",
					});
				}
				dispatchAfter = claimed;
			} else {
				dispatchAfter = serialize(existing) as Dispatch;
			}

			const responseId = randomUUID();
			const respondedAt = new Date();
			try {
				await DispatchResponseModel.create({
					_id: responseId,
					dispatchId: input.dispatchId,
					responderId: context.user.id,
					decision: input.decision,
					declineReason: input.declineReason,
					respondedAt,
					solanaTxSignature: input.signature,
					attestorPubkey: responder.walletAddress,
				});
			} catch (err) {
				if (isDuplicateKeyError(err)) {
					if (input.decision === "accept") {
						await DispatchModel.findByIdAndUpdate(input.dispatchId, {
							$pull: { claimedByResponderIds: context.user.id },
						});
					}
					throw new ORPCError("CONFLICT", {
						message: "duplicate_response",
					});
				}
				throw err;
			}

			const persistedResponse =
				await DispatchResponseModel.findById(responseId).lean();
			if (!persistedResponse) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "DispatchResponse vanished after create",
				});
			}
			const response = serialize(persistedResponse) as DispatchResponse;

			context.dispatchBroadcaster.broadcast({
				type: "dispatch.responded.signed",
				dispatchId: input.dispatchId,
				response,
				dispatch: dispatchAfter,
			});

			await recordIncidentEventWithSignature(
				{
					config: context.config,
					log: context.log,
					incidentBroadcaster: context.incidentBroadcaster,
				},
				{
					incidentId: existing.incidentId,
					kind: input.decision === "accept" ? "accepted" : "rejected",
					responderId: context.user.id,
					payload: {
						dispatchId: input.dispatchId,
						...(input.decision === "decline" && input.declineReason
							? { declineReason: input.declineReason }
							: {}),
					},
					occurredAt: respondedAt,
					solanaTxSignature: input.signature,
				},
			);

			return { response, dispatch: dispatchAfter };
		},
	),

	clear: os.dispatch.clear.handler(async ({ input, context }) => {
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

		settleDispatchPayment(context, input.dispatchId);

		return dispatch;
	}),

	prepareClearTx: authed.dispatch.prepareClearTx.handler(
		async ({ input, context }) => {
			const dispatch = await DispatchModel.findById(input.dispatchId).lean();
			if (!dispatch) {
				throw new ORPCError("NOT_FOUND", {
					message: `Dispatch not found: ${input.dispatchId}`,
				});
			}
			if (dispatch.status !== "claimed") {
				throw new ORPCError("CONFLICT", {
					message: `dispatch_not_claimable_for_clear: status=${dispatch.status}`,
				});
			}
			if (!dispatch.claimedByResponderIds.includes(context.user.id)) {
				throw new ORPCError("FORBIDDEN", {
					message: "not_claimer_of_dispatch",
				});
			}

			const responder = await ResponderModel.findById(context.user.id).lean();
			if (!responder?.walletAddress) {
				throw new ORPCError("UNAUTHORIZED", {
					message: "wallet_not_bound",
					data: { error: "wallet_not_bound" as const },
				});
			}

			const { connection, operator } = getSolanaContext(context.config);

			const hmacKey = context.config.CHAIN_HMAC_KEY;
			const incidentId = incidentIdToBytes(dispatch.incidentId, hmacKey);
			const payloadHash = dispatchClearPayloadHash({
				dispatchId: input.dispatchId,
			});

			let attestor: PublicKey;
			try {
				attestor = new PublicKey(responder.walletAddress);
			} catch {
				throw new ORPCError("UNAUTHORIZED", {
					message: "wallet_address_invalid",
				});
			}

			const occurredAt = Math.floor(Date.now() / 1000);
			const { transaction } = await buildRecordEventTx(
				{
					connection,
					incidentId,
					kind: "cleared",
					responderIdHash: ZERO_RESPONDER_HASH,
					payloadHash,
					occurredAt,
					attestorPubkey: attestor,
					feePayerPubkey: operator.publicKey,
				},
				operator,
			);
			partialSignAsFeePayer(transaction, operator);

			const serialized = transaction
				.serialize({ requireAllSignatures: false, verifySignatures: false })
				.toString("base64");

			const expiresAt = new Date(Date.now() + 60_000).toISOString();
			return {
				serializedTx: serialized,
				recentBlockhash: transaction.recentBlockhash ?? "",
				expiresAt,
			};
		},
	),

	commitSignedClear: authed.dispatch.commitSignedClear.handler(
		async ({ input, context }) => {
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
				clearedBy: context.user.id,
			});

			await recordIncidentEventWithSignature(
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
					solanaTxSignature: input.signature,
				},
			);

			settleDispatchPayment(context, input.dispatchId);

			return dispatch;
		},
	),
};
