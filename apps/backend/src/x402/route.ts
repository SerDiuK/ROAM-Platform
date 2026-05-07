import { randomUUID } from "node:crypto";
import type {
	FastifyBaseLogger,
	FastifyInstance,
	FastifyReply,
	FastifyRequest,
} from "fastify";
import type { Config } from "../config.js";
import { PayoutModel } from "../db/models/payout.js";
import type { DispatchBroadcaster } from "../ws/dispatchBroadcaster.js";
import { x402Prehandler, type X402Payment } from "./middleware.js";

interface CompleteBody {
	dispatchId: string;
}

// Registers POST /api/dispatch/complete as a raw Fastify route (not oRPC) so
// the x402 preHandler can intercept and reply with 402 before the body ever
// reaches the business logic.
export function registerDispatchCompleteRoute(
	app: FastifyInstance,
	config: Config,
	dispatchBroadcaster: DispatchBroadcaster,
	log: FastifyBaseLogger,
): void {
	app.post<{ Body: CompleteBody }>(
		"/api/dispatch/complete",
		{
			preHandler: async (request: FastifyRequest, reply: FastifyReply) => {
				await x402Prehandler(
					request as FastifyRequest & { x402Payment?: X402Payment },
					reply,
					config,
					log,
				);
			},
		},
		async (
			request: FastifyRequest & { x402Payment?: X402Payment },
			reply: FastifyReply,
		) => {
			const { dispatchId } = request.body as CompleteBody;
			const payment = request.x402Payment;

			if (!payment) {
				// Middleware should have handled this — defensive guard only.
				await reply.status(402).send({ error: "payment_required" });
				return;
			}

			const payoutId = randomUUID();
			const now = new Date();

			await PayoutModel.create({
				_id: payoutId,
				dispatchId,
				responderId: "roam-wallet",
				recipientWalletAddress: config.X402_RECIPIENT_ADDRESS,
				amountSol: payment.amountSol,
				status: "settled",
				initiatedAt: now,
				settledAt: now,
				solanaTxSignature: payment.solanaTxSignature,
			});

			log.info(
				{
					payoutId,
					dispatchId,
					sig: payment.solanaTxSignature,
					amountSol: payment.amountSol,
				},
				"dispatch settlement recorded",
			);

			dispatchBroadcaster.broadcast({
				type: "dispatch.paid",
				dispatchId,
				solanaTxSignature: payment.solanaTxSignature,
				amountSol: payment.amountSol,
			});

			await reply.status(200).send({
				ok: true,
				payoutId,
				dispatchId,
				solanaTxSignature: payment.solanaTxSignature,
				amountSol: payment.amountSol,
			});
		},
	);
}
