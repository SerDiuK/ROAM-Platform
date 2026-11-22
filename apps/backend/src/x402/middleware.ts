import { getCluster } from "@roam/solana-client";
import {
	Connection,
	clusterApiUrl,
	PublicKey,
	SystemProgram,
	Transaction,
} from "@solana/web3.js";
import type { FastifyBaseLogger, FastifyReply, FastifyRequest } from "fastify";
import type { Config } from "../config.js";
import { DispatchModel } from "../db/models/dispatch.js";
import { SETTLEMENT_SOL } from "./client.js";

const LAMPORTS_PER_SOL = 1_000_000_000n;
const X402_VERSION = 1;
const MAX_TIMEOUT_SECONDS = 300;
// Native SOL has no mint; the wrapped-SOL mint stands in as its asset id.
const SOL_ASSET = "So11111111111111111111111111111111111111112";

export interface X402Payment {
	solanaTxSignature: string;
	amountSol: number;
}

interface ExactSvmPayload {
	transaction: string;
}

interface PaymentPayload {
	x402Version: number;
	scheme: "exact";
	network: string;
	payload: ExactSvmPayload;
}

function decodePaymentHeader(raw: string): PaymentPayload {
	const json = Buffer.from(raw, "base64").toString("utf8");
	return JSON.parse(json) as PaymentPayload;
}

function buildConnection(config: Config): Connection {
	const cluster = getCluster(config.SOLANA_CLUSTER);
	const url =
		cluster === "localnet" ? "http://localhost:8899" : clusterApiUrl(cluster);
	return new Connection(url, "confirmed");
}

async function verifyAndSettle(
	connection: Connection,
	encodedTx: string,
	expectedRecipient: PublicKey,
	expectedLamports: bigint,
	log: FastifyBaseLogger,
): Promise<string> {
	const txBuf = Buffer.from(encodedTx, "base64");
	const tx = Transaction.from(txBuf);

	const systemIx = tx.instructions.find((ix) =>
		ix.programId.equals(SystemProgram.programId),
	);

	if (!systemIx) {
		throw new Error("x402: no SystemProgram instruction in payment tx");
	}

	// Transfer data: u32 LE instruction index (2 = Transfer), then u64 LE lamports.
	const data = systemIx.data;
	if (data.length < 12) {
		throw new Error("x402: SystemProgram instruction data too short");
	}
	const instructionIndex = data.readUInt32LE(0);
	if (instructionIndex !== 2) {
		throw new Error(`x402: expected Transfer (2), got ${instructionIndex}`);
	}
	const lamports = data.readBigUInt64LE(4);
	if (lamports < expectedLamports) {
		throw new Error(
			`x402: payment ${lamports} lamports < required ${expectedLamports}`,
		);
	}

	const recipient = systemIx.keys[1]?.pubkey;
	if (!recipient) {
		throw new Error("x402: no recipient account in transfer instruction");
	}
	if (!recipient.equals(expectedRecipient)) {
		throw new Error(
			`x402: recipient ${recipient.toBase58()} does not match expected ${expectedRecipient.toBase58()}`,
		);
	}

	log.info(
		{ lamports: lamports.toString(), recipient: recipient.toBase58() },
		"x402: SOL payment verified — submitting tx",
	);

	const sig = await connection.sendRawTransaction(tx.serialize(), {
		skipPreflight: false,
	});
	await connection.confirmTransaction(sig, "confirmed");

	log.info({ sig }, "x402: payment settled on-chain");
	return sig;
}

export async function x402Prehandler(
	request: FastifyRequest & { x402Payment?: X402Payment },
	reply: FastifyReply,
	config: Config,
	log: FastifyBaseLogger,
): Promise<void> {
	const body = request.body as { dispatchId?: string } | undefined;
	const dispatchId = body?.dispatchId;

	if (!dispatchId) {
		await reply
			.status(400)
			.send({ error: "dispatchId required in request body" });
		return;
	}

	const dispatch = await DispatchModel.findById(dispatchId)
		.select("payoutUsdc")
		.lean();
	if (!dispatch) {
		await reply
			.status(404)
			.send({ error: `dispatch not found: ${dispatchId}` });
		return;
	}

	const lamports = BigInt(
		Math.round(SETTLEMENT_SOL * Number(LAMPORTS_PER_SOL)),
	);
	const recipient = new PublicKey(config.X402_RECIPIENT_ADDRESS);

	const paymentHeader = request.headers["x-payment"] as string | undefined;

	if (!paymentHeader) {
		await reply.status(402).send({
			x402Version: X402_VERSION,
			accepts: [
				{
					scheme: "exact",
					network: config.X402_NETWORK,
					maxAmountRequired: lamports.toString(),
					resource: `http://localhost:${config.PORT}/api/dispatch/complete`,
					description: `ROAM dispatch settlement: ${dispatchId}`,
					mimeType: "application/json",
					payTo: recipient.toBase58(),
					maxTimeoutSeconds: MAX_TIMEOUT_SECONDS,
					asset: SOL_ASSET,
					extra: { dispatchId },
				},
			],
			error: "payment_required",
		});
		return;
	}

	try {
		const payload = decodePaymentHeader(paymentHeader);

		if (payload.x402Version !== X402_VERSION) {
			throw new Error(`unsupported x402 version: ${payload.x402Version}`);
		}
		if (payload.scheme !== "exact") {
			throw new Error(`unsupported scheme: ${payload.scheme}`);
		}

		const connection = buildConnection(config);
		const sig = await verifyAndSettle(
			connection,
			payload.payload.transaction,
			recipient,
			lamports,
			log,
		);

		request.x402Payment = { solanaTxSignature: sig, amountSol: SETTLEMENT_SOL };

		reply.header(
			"x-payment-response",
			Buffer.from(JSON.stringify({ success: true, txSignature: sig })).toString(
				"base64",
			),
		);
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		log.error({ err }, "x402 payment verification failed");
		await reply.status(402).send({ error: "payment_invalid", detail: message });
	}
}
