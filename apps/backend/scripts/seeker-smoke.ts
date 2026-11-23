import { randomUUID } from "node:crypto";
import { call } from "@orpc/server";
import { computeBriefingHash } from "@roam/shared";
import { Keypair, Transaction } from "@solana/web3.js";
import type { FastifyBaseLogger } from "fastify";
import mongoose from "mongoose";
import nacl from "tweetnacl";
import { type Config, parseConfig } from "../src/config.js";
import { connectDb } from "../src/db/connection.js";
import { BriefingModel } from "../src/db/models/briefing.js";
import { DispatchModel } from "../src/db/models/dispatch.js";
import { DispatchResponseModel } from "../src/db/models/dispatchResponse.js";
import { IncidentModel } from "../src/db/models/incident.js";
import { ResponderModel } from "../src/db/models/responder.js";
import type { AuthedUser, RpcContext } from "../src/rpc/context.js";
import { dispatchRouter } from "../src/rpc/procedures/dispatch.js";
import { sessionAuthRouter } from "../src/rpc/procedures/sessionAuth.js";
import { buildConnection } from "../src/services/solana.js";

// Requires SOLANA_OPERATOR_KEYPAIR funded with > 0.01 SOL on devnet.

function silentLogger(): FastifyBaseLogger {
	const noop = (): void => {};
	const log: FastifyBaseLogger = {
		level: "silent",
		info: noop,
		warn: noop,
		error: noop,
		debug: noop,
		trace: noop,
		fatal: noop,
		silent: noop,
		child: () => log,
	};
	return log;
}

function buildContext(config: Config, user: AuthedUser | null): RpcContext {
	return {
		config,
		// The Seeker flow never transcribes audio or calls the agent.
		transcriber: {} as RpcContext["transcriber"],
		anthropic: {} as RpcContext["anthropic"],
		pushClient: {
			sendPushToResponders: async () => ({
				tickets: [],
				delivered: 0,
				skipped: 0,
			}),
		},
		log: silentLogger(),
		user,
	};
}

async function main(): Promise<void> {
	const config = parseConfig();
	if (!config.SOLANA_OPERATOR_KEYPAIR) {
		throw new Error(
			"SOLANA_OPERATOR_KEYPAIR not set — fund a devnet keypair first",
		);
	}
	await connectDb(config.MONGODB_URL, console);

	const seeker = Keypair.generate();
	const seekerPubkey = seeker.publicKey.toBase58();
	console.log(`[seeker-smoke] synthetic Seeker pubkey: ${seekerPubkey}`);

	const responderId = randomUUID();
	const responderName = `SMOKE-${responderId.slice(0, 6).toUpperCase()}`;
	await ResponderModel.create({
		_id: responderId,
		name: responderName,
		role: "responder",
		availability: "available",
	});
	console.log(
		`[seeker-smoke] seeded responder ${responderName} (${responderId})`,
	);

	const ctxAnon = buildContext(config, null);

	const challenge = await call(
		sessionAuthRouter.siwsChallenge,
		{},
		{ context: ctxAnon },
	);
	console.log("[seeker-smoke] siwsChallenge OK");

	const siwsMessage = [
		`${challenge.domain} wants you to sign in with your Solana account:`,
		seekerPubkey,
		"",
		challenge.statement,
		"",
		`Nonce: ${challenge.nonce}`,
	].join("\n");
	const messageBytes = new TextEncoder().encode(siwsMessage);
	const sig = nacl.sign.detached(messageBytes, seeker.secretKey);

	const verified = await call(
		sessionAuthRouter.siwsVerify,
		{
			signedMessage: Buffer.from(messageBytes).toString("base64"),
			signature: Buffer.from(sig).toString("base64"),
			address: Buffer.from(seeker.publicKey.toBytes()).toString("base64"),
			name: responderName,
		},
		{ context: ctxAnon },
	);
	console.log("[seeker-smoke] siwsVerify OK — JWT issued");
	if (verified.responder.walletAddress !== seekerPubkey) {
		throw new Error("walletAddress not bound to synthetic Seeker pubkey");
	}

	const incidentId = randomUUID();
	const briefingId = randomUUID();
	const dispatchId = randomUUID();
	await IncidentModel.create({
		_id: incidentId,
		callStartedAt: new Date(),
		transcript: "smoke transcript",
		transcriptHash: "smoke-hash",
		classification: {
			incidentType: "MVA",
			urgency: 1,
			locationDescription: "smoke",
			requiredCapabilities: ["medic"],
		},
		status: "responding",
		assigned: { vehicles: [], responders: [responderId] },
	});
	const summary = "smoke briefing";
	const recommendedVehicleIds = ["smoke-vehicle"];
	const recommendedResponderIds = [responderId];
	const briefingHash = computeBriefingHash({
		summary,
		recommendedVehicleIds,
		recommendedResponderIds,
	});
	await BriefingModel.create({
		_id: briefingId,
		incidentId,
		generatedAt: new Date(),
		generatedByModel: "smoke",
		summary,
		recommendedVehicleIds,
		recommendedResponderIds,
		briefingHash,
	});
	await DispatchModel.create({
		_id: dispatchId,
		incidentId,
		briefingId,
		decisionMaker: "human",
		decidedAt: new Date(),
		assignedVehicleIds: recommendedVehicleIds,
		assignedResponderIds: recommendedResponderIds,
		requiredAccepts: 1,
		status: "pending",
		claimedByResponderIds: [],
		expiresAt: new Date(Date.now() + 5 * 60 * 1000),
	});
	console.log(`[seeker-smoke] seeded dispatch ${dispatchId}`);

	const ctxAuthed = buildContext(config, {
		id: responderId,
		name: responderName,
		role: "responder",
	});

	let cleanedUp = false;
	const cleanup = async (): Promise<void> => {
		if (cleanedUp) return;
		cleanedUp = true;
		await DispatchResponseModel.deleteMany({ dispatchId });
		await DispatchModel.findByIdAndDelete(dispatchId);
		await BriefingModel.findByIdAndDelete(briefingId);
		await IncidentModel.findByIdAndDelete(incidentId);
		await ResponderModel.findByIdAndDelete(responderId);
	};

	try {
		const prepared = await call(
			dispatchRouter.prepareResponseTx,
			{ dispatchId, decision: "accept" },
			{ context: ctxAuthed },
		);
		console.log("[seeker-smoke] prepareResponseTx OK");

		const tx = Transaction.from(Buffer.from(prepared.serializedTx, "base64"));
		tx.partialSign(seeker);

		const connection = buildConnection(config);
		const sigBase58 = await connection.sendRawTransaction(
			tx.serialize({ requireAllSignatures: true }),
			{ skipPreflight: false },
		);
		console.log(`[seeker-smoke] sent tx: ${sigBase58}`);
		await connection.confirmTransaction(sigBase58, "confirmed");
		console.log("[seeker-smoke] confirmed on chain");

		const committed = await call(
			dispatchRouter.commitSignedResponse,
			{ dispatchId, decision: "accept", signature: sigBase58 },
			{ context: ctxAuthed },
		);
		console.log("[seeker-smoke] commitSignedResponse OK");

		if (committed.response.attestorPubkey !== seekerPubkey) {
			throw new Error("attestorPubkey on response row != synthetic Seeker");
		}
		if (committed.response.solanaTxSignature !== sigBase58) {
			throw new Error("solanaTxSignature on response row != tx signature");
		}
		if (committed.dispatch.status !== "claimed") {
			throw new Error(
				`dispatch.status = ${committed.dispatch.status}, expected claimed`,
			);
		}

		console.log("[seeker-smoke] ✓ on-chain attestor matches synthetic Seeker");
		console.log(
			`[seeker-smoke] explorer: https://explorer.solana.com/tx/${sigBase58}?cluster=${config.SOLANA_CLUSTER}`,
		);
	} finally {
		await cleanup();
		await mongoose.disconnect();
	}
}

main().catch((err: unknown) => {
	console.error("[seeker-smoke] failed:", err);
	process.exit(1);
});
