import {
	type Connection,
	PublicKey,
	SystemProgram,
	Transaction,
} from "@solana/web3.js";
import type { FastifyBaseLogger, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Config } from "../config.js";
import { DispatchModel } from "../db/models/dispatch.js";
import { PayoutModel } from "../db/models/payout.js";
import { buildConnection } from "../services/solana.js";
import { SETTLEMENT_LAMPORTS, X402_VERSION, x402Network } from "./client.js";

const MAX_TIMEOUT_SECONDS = 300;
// Native SOL has no mint; the wrapped-SOL mint stands in as its asset id.
const SOL_ASSET = "So11111111111111111111111111111111111111112";

const CompleteRequestSchema = z.object({ dispatchId: z.string().min(1) });

const PaymentPayloadSchema = z.object({
	x402Version: z.literal(X402_VERSION),
	scheme: z.literal("exact"),
	network: z.string(),
	payload: z.object({ transaction: z.string().min(1) }),
});

async function verifyAndSettle(
	connection: Connection,
	encodedTx: string,
	expectedRecipient: PublicKey,
	expectedLamports: bigint,
	log: FastifyBaseLogger,
): Promise<string> {
	const tx = Transaction.from(Buffer.from(encodedTx, "base64"));

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

export async function settleX402Payment(
	request: FastifyRequest,
	reply: FastifyReply,
	config: Config,
	log: FastifyBaseLogger,
): Promise<{ dispatchId: string; solanaTxSignature: string } | null> {
	const body = CompleteRequestSchema.safeParse(request.body);
	if (!body.success) {
		await reply
			.status(400)
			.send({ error: "dispatchId required in request body" });
		return null;
	}
	const { dispatchId } = body.data;

	if (!(await DispatchModel.exists({ _id: dispatchId, status: "cleared" }))) {
		await reply
			.status(404)
			.send({ error: `no cleared dispatch: ${dispatchId}` });
		return null;
	}
	if (await PayoutModel.exists({ dispatchId })) {
		await reply
			.status(409)
			.send({ error: `dispatch already settled: ${dispatchId}` });
		return null;
	}

	const recipient = new PublicKey(config.X402_RECIPIENT_ADDRESS);
	const paymentHeader = request.headers["x-payment"];

	if (typeof paymentHeader !== "string") {
		await reply.status(402).send({
			x402Version: X402_VERSION,
			accepts: [
				{
					scheme: "exact",
					network: x402Network(config),
					maxAmountRequired: SETTLEMENT_LAMPORTS.toString(),
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
		return null;
	}

	try {
		const payment = PaymentPayloadSchema.parse(
			JSON.parse(Buffer.from(paymentHeader, "base64").toString("utf8")),
		);
		const sig = await verifyAndSettle(
			buildConnection(config),
			payment.payload.transaction,
			recipient,
			SETTLEMENT_LAMPORTS,
			log,
		);
		reply.header(
			"x-payment-response",
			Buffer.from(JSON.stringify({ success: true, txSignature: sig })).toString(
				"base64",
			),
		);
		return { dispatchId, solanaTxSignature: sig };
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		log.error({ err }, "x402 payment verification failed");
		await reply.status(402).send({ error: "payment_invalid", detail: message });
		return null;
	}
}
