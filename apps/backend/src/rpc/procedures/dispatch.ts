import { createHash, randomUUID } from "node:crypto";
import { ORPCError } from "@orpc/server";
import {
	computeBriefingHash,
	DISPATCH_STATUSES,
	type Dispatch,
	type DispatchResponse,
	DispatchResponseSchema,
	DispatchSchema,
} from "@roam/shared";
import {
	buildRecordEventTx,
	partialSignAsFeePayer,
	verifyRecordEventTx,
} from "@roam/solana-client";
import { type Keypair, PublicKey, type Transaction } from "@solana/web3.js";
import { isDuplicateKeyError } from "../../db/errors.js";
import { BriefingModel } from "../../db/models/briefing.js";
import { DispatchModel } from "../../db/models/dispatch.js";
import { DispatchResponseModel } from "../../db/models/dispatchResponse.js";
import { IncidentModel } from "../../db/models/incident.js";
import { ResponderModel } from "../../db/models/responder.js";
import { toWire } from "../../db/serializers/wire.js";
import {
	responderIdHash as hashResponderId,
	incidentIdToBytes,
	recordIncidentEvent,
	recordIncidentEventWithSignature,
} from "../../services/incidentEvents.js";
import { buildConnection, getSolanaContext } from "../../services/solana.js";
import { triggerX402Payment } from "../../x402/client.js";
import { authed, os } from "../builder.js";
import type { RpcContext } from "../context.js";

const ACTIVE_STATUSES = ["pending", "claimed"] as const;

// A blockhash is valid for 150 blocks, roughly 60–90 s.
const PREPARED_TX_TTL_MS = 60_000;

// `cleared` is incident-scoped: a zero responder hash gives one cleared PDA per incident.
const ZERO_RESPONDER_HASH = new Uint8Array(32);

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
		{ returnDocument: "after", updatePipeline: true },
	).lean();
	return claimed ? toWire(DispatchSchema, claimed) : null;
}

async function releaseClaim(
	dispatchId: string,
	responderId: string,
): Promise<void> {
	await DispatchModel.updateOne(
		{ _id: dispatchId, status: { $in: ACTIVE_STATUSES } },
		[
			{
				$set: {
					claimedByResponderIds: {
						$filter: {
							input: "$claimedByResponderIds",
							cond: { $ne: ["$$this", responderId] },
						},
					},
				},
			},
			{
				$set: {
					status: {
						$cond: [
							{
								$lt: [{ $size: "$claimedByResponderIds" }, "$requiredAccepts"],
							},
							"pending",
							"$status",
						],
					},
				},
			},
		],
		{ updatePipeline: true },
	);
}

async function withdrawDecliningCrew(
	dispatch: { _id: string; incidentId: string },
	responderId: string,
): Promise<Dispatch | null> {
	await IncidentModel.updateOne(
		{ _id: dispatch.incidentId },
		{ $pull: { "assigned.responders": responderId } },
	);
	const updated = await DispatchModel.findOneAndUpdate(
		{
			_id: dispatch._id,
			status: "pending",
			assignedResponderIds: responderId,
		},
		[
			{
				$set: {
					requiredAccepts: {
						$max: [1, { $subtract: ["$requiredAccepts", 1] }],
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
		{ returnDocument: "after", updatePipeline: true },
	).lean();
	return updated ? toWire(DispatchSchema, updated) : null;
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

async function boundWallet(responderId: string): Promise<PublicKey> {
	const responder = await ResponderModel.findById(responderId).lean();
	if (!responder?.walletAddress) {
		throw new ORPCError("UNAUTHORIZED", { message: "wallet_not_bound" });
	}
	try {
		return new PublicKey(responder.walletAddress);
	} catch {
		throw new ORPCError("UNAUTHORIZED", { message: "wallet_address_invalid" });
	}
}

function toPreparedTx(
	transaction: Transaction,
	operator: Keypair,
): { serializedTx: string; recentBlockhash: string; expiresAt: string } {
	partialSignAsFeePayer(transaction, operator);
	return {
		serializedTx: transaction
			.serialize({ requireAllSignatures: false, verifySignatures: false })
			.toString("base64"),
		recentBlockhash: transaction.recentBlockhash ?? "",
		expiresAt: new Date(Date.now() + PREPARED_TX_TTL_MS).toISOString(),
	};
}

async function assertEventLanded(
	context: RpcContext,
	args: {
		signature: string;
		incidentId: string;
		kind: "accepted" | "rejected" | "cleared";
		responderIdHash: Uint8Array;
		attestor: PublicKey;
	},
): Promise<void> {
	const landed = await verifyRecordEventTx({
		connection: buildConnection(context.config),
		signature: args.signature,
		incidentId: incidentIdToBytes(
			args.incidentId,
			context.config.CHAIN_HMAC_KEY,
		),
		kind: args.kind,
		responderIdHash: args.responderIdHash,
		attestorPubkey: args.attestor,
	});
	if (!landed) {
		throw new ORPCError("BAD_REQUEST", { message: "signature_not_verified" });
	}
}

async function saveResponse(
	args: {
		dispatchId: string;
		responderId: string;
		decision: "accept" | "decline";
		declineReason?: string;
		signature: string;
		attestor: PublicKey;
	},
	releaseOnConflict: boolean,
): Promise<DispatchResponse> {
	try {
		const created = await DispatchResponseModel.create({
			_id: randomUUID(),
			dispatchId: args.dispatchId,
			responderId: args.responderId,
			decision: args.decision,
			declineReason: args.declineReason,
			respondedAt: new Date(),
			solanaTxSignature: args.signature,
			attestorPubkey: args.attestor.toBase58(),
		});
		return toWire(DispatchResponseSchema, created);
	} catch (err) {
		if (!isDuplicateKeyError(err)) throw err;
		if (releaseOnConflict)
			await releaseClaim(args.dispatchId, args.responderId);
		throw new ORPCError("CONFLICT", { message: "duplicate_response" });
	}
}

async function rejectUnclearable(dispatchId: string): Promise<never> {
	const existing = await DispatchModel.findById(dispatchId).lean();
	if (!existing) {
		throw new ORPCError("NOT_FOUND", {
			message: `Dispatch not found: ${dispatchId}`,
		});
	}
	throw new ORPCError("CONFLICT", {
		message: `dispatch_not_claimable_for_clear: status=${existing.status}`,
	});
}

function notifyDispatchedResponders(
	context: RpcContext,
	args: {
		dispatchId: string;
		responderIds: string[];
		title: string;
		body: string;
	},
): void {
	context.pushClient
		.sendPushToResponders(args.responderIds, {
			title: args.title,
			body: args.body,
			data: { type: "dispatch.created", dispatchId: args.dispatchId },
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
	triggerX402Payment(context.config, context.log, dispatchId).catch(
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
		const statuses = input?.includeCleared
			? DISPATCH_STATUSES
			: ACTIVE_STATUSES;
		const docs = await DispatchModel.find({ status: { $in: statuses } })
			.sort({ decidedAt: -1 })
			.limit(input?.limit ?? 50)
			.lean();
		return docs.map((doc) => toWire(DispatchSchema, doc));
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
		return {
			dispatch: toWire(DispatchSchema, dispatch),
			responses: responses.map((r) => toWire(DispatchResponseSchema, r)),
		};
	}),

	confirm: os.dispatch.confirm.handler(async ({ input, context }) => {
		const briefing = await BriefingModel.findById(input.briefingId).lean();
		if (!briefing) {
			throw new ORPCError("NOT_FOUND", {
				message: `Briefing not found: ${input.briefingId}`,
			});
		}
		if (computeBriefingHash(briefing) !== briefing.briefingHash) {
			throw new ORPCError("CONFLICT", {
				message: "briefing_hash_mismatch",
			});
		}
		if (input.requiredAccepts > briefing.recommendedResponderIds.length) {
			throw new ORPCError("BAD_REQUEST", {
				message: "required_accepts_exceeds_crew",
			});
		}

		const incident = await IncidentModel.findById(briefing.incidentId).lean();
		if (!incident) {
			throw new ORPCError("NOT_FOUND", {
				message: `Incident not found: ${briefing.incidentId}`,
			});
		}
		if (incident.status === "resolved" || incident.status === "cancelled") {
			throw new ORPCError("CONFLICT", { message: "incident_closed" });
		}

		const now = new Date();
		const active = await DispatchModel.exists({
			incidentId: briefing.incidentId,
			$or: [
				{ status: "claimed" },
				{ status: "pending", expiresAt: { $gt: now } },
			],
		});
		if (active) {
			throw new ORPCError("CONFLICT", { message: "dispatch_already_active" });
		}

		const created = await DispatchModel.create({
			_id: randomUUID(),
			incidentId: briefing.incidentId,
			briefingId: briefing._id,
			decisionMaker: input.decisionMaker,
			decidedBy: input.decidedBy,
			decidedAt: now,
			assignedVehicleIds: briefing.recommendedVehicleIds,
			assignedResponderIds: briefing.recommendedResponderIds,
			requiredAccepts: input.requiredAccepts,
			status: "pending",
			claimedByResponderIds: [],
			expiresAt: new Date(now.getTime() + input.expiresInSecs * 1000),
		});
		const dispatch = toWire(DispatchSchema, created);

		await IncidentModel.findByIdAndUpdate(briefing.incidentId, {
			status: "responding",
			dispatchedAt: now,
			assigned: {
				vehicles: briefing.recommendedVehicleIds,
				responders: briefing.recommendedResponderIds,
			},
		});

		notifyDispatchedResponders(context, {
			dispatchId: dispatch._id,
			responderIds: briefing.recommendedResponderIds,
			title: incident.classification?.incidentType ?? "Dispatch",
			body: briefing.summary,
		});

		const eventDeps = { config: context.config, log: context.log };
		await Promise.all(
			briefing.recommendedResponderIds.map((responderId) =>
				recordIncidentEvent(eventDeps, {
					incidentId: briefing.incidentId,
					kind: "dispatched",
					responderId,
					payload: { dispatchId: dispatch._id, briefingId: briefing._id },
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
				const responded =
					dispatch.claimedByResponderIds.includes(context.user.id) ||
					(await DispatchResponseModel.exists({
						dispatchId: input.dispatchId,
						responderId: context.user.id,
					}));
				if (responded) {
					throw new ORPCError("CONFLICT", { message: "duplicate_response" });
				}
			}

			const attestor = await boundWallet(context.user.id);
			const { connection, operator } = getSolanaContext(context.config);
			const hmacKey = context.config.CHAIN_HMAC_KEY;
			const transaction = await buildRecordEventTx(
				{
					connection,
					incidentId: incidentIdToBytes(dispatch.incidentId, hmacKey),
					kind: input.decision === "accept" ? "accepted" : "rejected",
					responderIdHash: hashResponderId(context.user.id, hmacKey),
					payloadHash: dispatchEventPayloadHash({
						dispatchId: input.dispatchId,
						decision: input.decision,
						declineReason: input.declineReason,
					}),
					occurredAtSecs: Math.floor(Date.now() / 1000),
					attestorPubkey: attestor,
					feePayerPubkey: operator.publicKey,
				},
				operator,
			);
			return toPreparedTx(transaction, operator);
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

			const attestor = await boundWallet(context.user.id);
			const kind = input.decision === "accept" ? "accepted" : "rejected";
			await assertEventLanded(context, {
				signature: input.signature,
				incidentId: existing.incidentId,
				kind,
				responderIdHash: hashResponderId(
					context.user.id,
					context.config.CHAIN_HMAC_KEY,
				),
				attestor,
			});

			const claimed =
				input.decision === "accept"
					? await claimDispatch(input.dispatchId, context.user.id)
					: null;
			if (input.decision === "accept" && !claimed) {
				throw new ORPCError("CONFLICT", {
					message: "dispatch_already_claimed",
				});
			}

			const response = await saveResponse(
				{
					dispatchId: input.dispatchId,
					responderId: context.user.id,
					decision: input.decision,
					declineReason: input.declineReason,
					signature: input.signature,
					attestor,
				},
				claimed !== null,
			);

			const dispatch =
				claimed ??
				(await withdrawDecliningCrew(existing, context.user.id)) ??
				toWire(DispatchSchema, existing);

			await recordIncidentEventWithSignature(
				{ config: context.config, log: context.log },
				{
					incidentId: existing.incidentId,
					kind,
					responderId: context.user.id,
					payload: {
						dispatchId: input.dispatchId,
						...(input.decision === "decline" && input.declineReason
							? { declineReason: input.declineReason }
							: {}),
					},
					occurredAt: response.respondedAt,
					solanaTxSignature: input.signature,
				},
			);

			return { response, dispatch };
		},
	),

	clear: os.dispatch.clear.handler(async ({ input, context }) => {
		const now = new Date();
		const cleared = await DispatchModel.findOneAndUpdate(
			{ _id: input.dispatchId, status: "claimed" },
			{ $set: { status: "cleared" } },
			{ returnDocument: "after" },
		).lean();
		if (!cleared) return rejectUnclearable(input.dispatchId);

		await IncidentModel.findByIdAndUpdate(cleared.incidentId, {
			status: "resolved",
			clearedAt: now,
		});

		await recordIncidentEvent(
			{ config: context.config, log: context.log },
			{
				incidentId: cleared.incidentId,
				kind: "cleared",
				payload: { dispatchId: input.dispatchId },
				occurredAt: now,
			},
		);

		settleDispatchPayment(context, input.dispatchId);

		return toWire(DispatchSchema, cleared);
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

			const attestor = await boundWallet(context.user.id);
			const { connection, operator } = getSolanaContext(context.config);
			const transaction = await buildRecordEventTx(
				{
					connection,
					incidentId: incidentIdToBytes(
						dispatch.incidentId,
						context.config.CHAIN_HMAC_KEY,
					),
					kind: "cleared",
					responderIdHash: ZERO_RESPONDER_HASH,
					payloadHash: dispatchClearPayloadHash({
						dispatchId: input.dispatchId,
					}),
					occurredAtSecs: Math.floor(Date.now() / 1000),
					attestorPubkey: attestor,
					feePayerPubkey: operator.publicKey,
				},
				operator,
			);
			return toPreparedTx(transaction, operator);
		},
	),

	commitSignedClear: authed.dispatch.commitSignedClear.handler(
		async ({ input, context }) => {
			const existing = await DispatchModel.findById(input.dispatchId).lean();
			if (!existing) {
				throw new ORPCError("NOT_FOUND", {
					message: `Dispatch not found: ${input.dispatchId}`,
				});
			}
			if (existing.status !== "claimed") {
				throw new ORPCError("CONFLICT", {
					message: `dispatch_not_claimable_for_clear: status=${existing.status}`,
				});
			}
			if (!existing.claimedByResponderIds.includes(context.user.id)) {
				throw new ORPCError("FORBIDDEN", {
					message: "not_claimer_of_dispatch",
				});
			}

			const attestor = await boundWallet(context.user.id);
			await assertEventLanded(context, {
				signature: input.signature,
				incidentId: existing.incidentId,
				kind: "cleared",
				responderIdHash: ZERO_RESPONDER_HASH,
				attestor,
			});

			const now = new Date();
			const cleared = await DispatchModel.findOneAndUpdate(
				{
					_id: input.dispatchId,
					status: "claimed",
					claimedByResponderIds: context.user.id,
				},
				{ $set: { status: "cleared" } },
				{ returnDocument: "after" },
			).lean();
			if (!cleared) return rejectUnclearable(input.dispatchId);

			await IncidentModel.findByIdAndUpdate(cleared.incidentId, {
				status: "resolved",
				clearedAt: now,
			});

			await recordIncidentEventWithSignature(
				{ config: context.config, log: context.log },
				{
					incidentId: cleared.incidentId,
					kind: "cleared",
					payload: { dispatchId: input.dispatchId },
					occurredAt: now,
					solanaTxSignature: input.signature,
				},
			);

			settleDispatchPayment(context, input.dispatchId);

			return toWire(DispatchSchema, cleared);
		},
	),
};
