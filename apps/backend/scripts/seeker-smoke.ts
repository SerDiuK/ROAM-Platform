import { randomUUID } from "node:crypto";
import { call } from "@orpc/server";
import { Connection, Keypair } from "@solana/web3.js";
import mongoose from "mongoose";
import nacl from "tweetnacl";
import { computeBriefingHash } from "../src/agent/runner.js";
import { parseConfig } from "../src/config.js";
import { connectDb } from "../src/db/connection.js";
import { BriefingModel } from "../src/db/models/briefing.js";
import { DispatchModel } from "../src/db/models/dispatch.js";
import { DispatchResponseModel } from "../src/db/models/dispatchResponse.js";
import { IncidentModel } from "../src/db/models/incident.js";
import { ResponderModel } from "../src/db/models/responder.js";
import type { AuthedUser, RpcContext } from "../src/rpc/context.js";
import { dispatchRouter } from "../src/rpc/procedures/dispatch.js";
import { sessionAuthRouter } from "../src/rpc/procedures/sessionAuth.js";

// Requires SOLANA_OPERATOR_KEYPAIR funded with > 0.01 SOL on devnet.

function fakeBroadcaster(): {
	addClient: () => void;
	removeClient: () => void;
	broadcast: () => void;
} {
	return { addClient: () => {}, removeClient: () => {}, broadcast: () => {} };
}

function fakeLogger(): {
	info: () => void;
	warn: () => void;
	error: () => void;
	debug: () => void;
	trace: () => void;
	fatal: () => void;
	child: () => ReturnType<typeof fakeLogger>;
	level: string;
	silent: () => void;
} {
	const log = {
		info: () => {},
		warn: () => {},
		error: () => {},
		debug: () => {},
		trace: () => {},
		fatal: () => {},
		child: () => log,
		level: "silent",
		silent: () => {},
	};
	return log;
}

function buildContext(
	config: ReturnType<typeof parseConfig>,
	user: AuthedUser | null,
): RpcContext {
	return {
		config,
		incidentBroadcaster:
			fakeBroadcaster() as unknown as RpcContext["incidentBroadcaster"],
		dispatchBroadcaster:
			fakeBroadcaster() as unknown as RpcContext["dispatchBroadcaster"],
		walletProvider: {} as RpcContext["walletProvider"],
		transcriber: {} as RpcContext["transcriber"],
		anthropic: {} as RpcContext["anthropic"],
		pushClient: {
			sendPushToResponders: async () => ({
				tickets: [],
				delivered: 0,
				skipped: 0,
			}),
		} as unknown as RpcContext["pushClient"],
		log: fakeLogger() as unknown as RpcContext["log"],
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
	const payout = {
		baseUsdc: 10,
		urgencyMultiplier: 1,
		hazmatMultiplier: 1,
		distanceMultiplier: 1,
		totalUsdc: 10,
	};
	const briefingHash = computeBriefingHash({
		summary,
		recommendedVehicleIds,
		recommendedResponderIds,
		payout,
	});
	await BriefingModel.create({
		_id: briefingId,
		incidentId,
		generatedAt: new Date(),
		generatedByModel: "smoke",
		summary,
		recommendedVehicleIds,
		recommendedResponderIds,
		payout,
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
		payoutUsdc: 10,
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

		const { Transaction } = await import("@solana/web3.js");
		const tx = Transaction.from(Buffer.from(prepared.serializedTx, "base64"));
		tx.partialSign(seeker);

		const cluster =
			config.SOLANA_CLUSTER === "mainnet-beta" ||
			config.SOLANA_CLUSTER === "mainnet"
				? "https://api.mainnet-beta.solana.com"
				: "https://api.devnet.solana.com";
		const connection = new Connection(cluster, "confirmed");
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

		const explorerCluster =
			config.SOLANA_CLUSTER === "mainnet" ||
			config.SOLANA_CLUSTER === "mainnet-beta"
				? ""
				: `?cluster=${config.SOLANA_CLUSTER}`;
		console.log("[seeker-smoke] ✓ on-chain attestor matches synthetic Seeker");
		console.log(
			`[seeker-smoke] explorer: https://explorer.solana.com/tx/${sigBase58}${explorerCluster}`,
		);
	} finally {
		await cleanup();
		await mongoose.disconnect();
	}
}

main().catch(async (err: unknown) => {
	console.error("[seeker-smoke] failed:", err);
	try {
		await mongoose.disconnect();
	} catch {
		// Best-effort disconnect; the original error is already logged.
	}
	process.exit(1);
});
