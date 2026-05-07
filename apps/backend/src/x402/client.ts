import {
	Connection,
	Keypair,
	PublicKey,
	SystemProgram,
	Transaction,
	clusterApiUrl,
} from "@solana/web3.js";
import bs58 from "bs58";
import type { FastifyBaseLogger } from "fastify";
import { getCluster } from "@roam/solana-client";
import type { Config } from "../config.js";

const LAMPORTS_PER_SOL = 1_000_000_000n;
const X402_VERSION = 1;

// SOL amount per dispatch settlement. 0.001 SOL — visible on-chain, negligible cost.
export const SETTLEMENT_SOL = 0.001;

interface PaymentRequirements {
	scheme: string;
	network: string;
	maxAmountRequired: string;
	asset: string;
	payTo: string;
	maxTimeoutSeconds: number;
}

interface X402ChallengeBody {
	x402Version: number;
	accepts: PaymentRequirements[];
}

function loopbackUrl(config: Config): string {
	return `http://localhost:${config.PORT}`;
}

function buildConnection(config: Config): Connection {
	const cluster = getCluster(config.SOLANA_CLUSTER);
	const url =
		cluster === "localnet" ? "http://localhost:8899" : clusterApiUrl(cluster);
	return new Connection(url, "confirmed");
}

// Constructs, signs, and base64-encodes a native SOL transfer transaction.
async function buildSignedSolTransferTx(
	connection: Connection,
	operatorKeypair: Keypair,
	recipientAddress: string,
	lamports: bigint,
): Promise<string> {
	const recipient = new PublicKey(recipientAddress);

	const tx = new Transaction().add(
		SystemProgram.transfer({
			fromPubkey: operatorKeypair.publicKey,
			toPubkey: recipient,
			lamports,
		}),
	);

	const { blockhash } = await connection.getLatestBlockhash("confirmed");
	tx.recentBlockhash = blockhash;
	tx.feePayer = operatorKeypair.publicKey;
	tx.sign(operatorKeypair);

	return tx.serialize().toString("base64");
}

function encodePaymentPayload(payload: {
	x402Version: number;
	scheme: string;
	network: string;
	payload: { transaction: string };
}): string {
	return Buffer.from(JSON.stringify(payload)).toString("base64");
}

function selectSvmRequirement(
	accepts: PaymentRequirements[],
	preferredNetwork: string,
): PaymentRequirements {
	const match =
		accepts.find((r) => r.network === preferredNetwork) ?? accepts[0];
	if (!match) throw new Error("x402: no acceptable payment requirement in 402 body");
	return match;
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
	const connection = buildConnection(config);
	const base = loopbackUrl(config);
	const endpoint = `${base}/api/dispatch/complete`;
	const body = JSON.stringify({ dispatchId });
	const headers = { "content-type": "application/json" };

	// Step 1: probe — expect 402
	const probe = await fetch(endpoint, { method: "POST", headers, body });

	if (probe.status !== 402) {
		const text = await probe.text();
		throw new Error(
			`x402: expected 402 from ${endpoint}, got ${probe.status}: ${text}`,
		);
	}

	const challenge = (await probe.json()) as X402ChallengeBody;
	const requirement = selectSvmRequirement(challenge.accepts, config.X402_NETWORK);

	log.info(
		{
			dispatchId,
			lamports: requirement.maxAmountRequired,
			payTo: requirement.payTo,
		},
		"x402: 402 received — building SOL payment",
	);

	// Step 2: build signed SOL transfer
	const lamports = BigInt(requirement.maxAmountRequired);
	const signedTx = await buildSignedSolTransferTx(
		connection,
		operatorKeypair,
		requirement.payTo,
		lamports,
	);

	const paymentHeader = encodePaymentPayload({
		x402Version: X402_VERSION,
		scheme: "exact",
		network: requirement.network,
		payload: { transaction: signedTx },
	});

	// Step 3: retry with payment
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
	if (responseHeader) {
		try {
			const decoded = JSON.parse(
				Buffer.from(responseHeader, "base64").toString("utf8"),
			) as { txSignature?: string };
			if (decoded.txSignature) {
				log.info(
					{ sig: decoded.txSignature, dispatchId },
					"x402: dispatch settled on-chain",
				);
				return decoded.txSignature;
			}
		} catch {
			// non-fatal
		}
	}

	const responseBody = (await settled.json()) as { solanaTxSignature?: string };
	return responseBody.solanaTxSignature ?? "";
}

export { LAMPORTS_PER_SOL };
