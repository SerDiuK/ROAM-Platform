import {
	type Connection,
	Keypair,
	LAMPORTS_PER_SOL,
	PublicKey,
	SystemProgram,
	Transaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import type { FastifyBaseLogger } from "fastify";
import { z } from "zod";
import type { Config } from "../config.js";
import { buildConnection } from "../services/solana.js";

export const X402_VERSION = 1;
export const SETTLEMENT_SOL = 0.001;
export const SETTLEMENT_LAMPORTS = BigInt(
	Math.round(SETTLEMENT_SOL * LAMPORTS_PER_SOL),
);

const ChallengeSchema = z.object({
	x402Version: z.literal(X402_VERSION),
	accepts: z
		.array(
			z.object({
				network: z.string(),
				maxAmountRequired: z.string(),
				payTo: z.string(),
			}),
		)
		.min(1),
});

const PaymentResponseSchema = z.object({ txSignature: z.string().min(1) });

export function x402Network(config: Config): "solana" | "solana-devnet" {
	return config.SOLANA_CLUSTER === "mainnet-beta" ? "solana" : "solana-devnet";
}

async function buildSignedSolTransferTx(
	connection: Connection,
	operatorKeypair: Keypair,
	recipientAddress: string,
	lamports: bigint,
): Promise<string> {
	const tx = new Transaction().add(
		SystemProgram.transfer({
			fromPubkey: operatorKeypair.publicKey,
			toPubkey: new PublicKey(recipientAddress),
			lamports,
		}),
	);

	const { blockhash } = await connection.getLatestBlockhash("confirmed");
	tx.recentBlockhash = blockhash;
	tx.feePayer = operatorKeypair.publicKey;
	tx.sign(operatorKeypair);

	return tx.serialize().toString("base64");
}

export async function triggerX402Payment(
	config: Config,
	log: FastifyBaseLogger,
	dispatchId: string,
): Promise<string> {
	if (!config.SOLANA_OPERATOR_KEYPAIR) {
		throw new Error("x402: SOLANA_OPERATOR_KEYPAIR not set");
	}

	const operatorKeypair = Keypair.fromSecretKey(
		bs58.decode(config.SOLANA_OPERATOR_KEYPAIR),
	);
	const endpoint = `http://localhost:${config.PORT}/api/dispatch/complete`;
	const body = JSON.stringify({ dispatchId });
	const headers = { "content-type": "application/json" };

	const probe = await fetch(endpoint, { method: "POST", headers, body });
	if (probe.status !== 402) {
		const text = await probe.text();
		throw new Error(
			`x402: expected 402 from ${endpoint}, got ${probe.status}: ${text}`,
		);
	}

	const { accepts } = ChallengeSchema.parse(await probe.json());
	const network = x402Network(config);
	const requirement = accepts.find((r) => r.network === network);
	if (!requirement) {
		throw new Error(`x402: no payment requirement for ${network}`);
	}

	log.info(
		{
			dispatchId,
			lamports: requirement.maxAmountRequired,
			payTo: requirement.payTo,
		},
		"x402: 402 received — building SOL payment",
	);

	const signedTx = await buildSignedSolTransferTx(
		buildConnection(config),
		operatorKeypair,
		requirement.payTo,
		BigInt(requirement.maxAmountRequired),
	);

	const paymentHeader = Buffer.from(
		JSON.stringify({
			x402Version: X402_VERSION,
			scheme: "exact",
			network: requirement.network,
			payload: { transaction: signedTx },
		}),
	).toString("base64");

	const settled = await fetch(endpoint, {
		method: "POST",
		headers: { ...headers, "x-payment": paymentHeader },
		body,
	});
	if (!settled.ok) {
		const text = await settled.text();
		throw new Error(
			`x402: settlement request failed (${settled.status}): ${text}`,
		);
	}

	const responseHeader = settled.headers.get("x-payment-response");
	if (!responseHeader) {
		throw new Error("x402: settlement response has no x-payment-response");
	}
	const { txSignature } = PaymentResponseSchema.parse(
		JSON.parse(Buffer.from(responseHeader, "base64").toString("utf8")),
	);
	log.info({ sig: txSignature, dispatchId }, "x402: dispatch settled on-chain");
	return txSignature;
}
