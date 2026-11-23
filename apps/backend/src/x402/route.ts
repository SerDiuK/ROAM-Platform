import { randomUUID } from "node:crypto";
import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import type { Config } from "../config.js";
import { PayoutModel } from "../db/models/payout.js";
import { SETTLEMENT_SOL } from "./client.js";
import { settleX402Payment } from "./middleware.js";

// Raw Fastify route, not oRPC: x402 answers with a bare 402 and its own headers.
export function registerDispatchCompleteRoute(
	app: FastifyInstance,
	config: Config,
	log: FastifyBaseLogger,
): void {
	app.post("/api/dispatch/complete", async (request, reply) => {
		const payment = await settleX402Payment(request, reply, config, log);
		if (!payment) return;

		const payoutId = randomUUID();
		await PayoutModel.create({
			_id: payoutId,
			dispatchId: payment.dispatchId,
			recipientWalletAddress: config.X402_RECIPIENT_ADDRESS,
			amountSol: SETTLEMENT_SOL,
			settledAt: new Date(),
			solanaTxSignature: payment.solanaTxSignature,
		});

		log.info(
			{
				payoutId,
				dispatchId: payment.dispatchId,
				sig: payment.solanaTxSignature,
				amountSol: SETTLEMENT_SOL,
			},
			"dispatch settlement recorded",
		);

		await reply.status(200).send({
			ok: true,
			payoutId,
			dispatchId: payment.dispatchId,
			solanaTxSignature: payment.solanaTxSignature,
			amountSol: SETTLEMENT_SOL,
		});
	});
}
