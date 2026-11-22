import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { parseConfig } from "../src/config.js";
import { connectDb } from "../src/db/connection.js";
import { ResponderModel } from "../src/db/models/responder.js";
import {
	createWalletProvider,
	EmbeddedSolanaProvider,
} from "../src/wallet/index.js";

// Requires the agent's USDC token account funded, e.g. via https://faucet.circle.com/.

async function main(): Promise<void> {
	const config = parseConfig();
	await connectDb(config.MONGODB_URL, console);

	const wallet = createWalletProvider(config);
	if (!(wallet instanceof EmbeddedSolanaProvider)) {
		throw new Error("Smoke is written for EmbeddedSolanaProvider");
	}

	const responderId = randomUUID();
	const name = `smoke-${responderId.slice(0, 8)}`;
	console.log(`[wallet-smoke] creating responder ${name} (${responderId})`);
	await ResponderModel.create({
		_id: responderId,
		name,
		role: "responder",
		availability: "off_duty",
	});

	try {
		const created = await wallet.createWallet(responderId);
		console.log(`[wallet-smoke] wallet address = ${created.address}`);

		const lookup = await wallet.getAddress(responderId);
		if (lookup !== created.address) {
			throw new Error(
				`getAddress mismatch: expected ${created.address}, got ${lookup ?? "null"}`,
			);
		}
		console.log("[wallet-smoke] getAddress round-trips OK");

		const idempotent = await wallet.createWallet(responderId);
		if (idempotent.address !== created.address) {
			throw new Error("createWallet is not idempotent");
		}
		console.log("[wallet-smoke] createWallet idempotent OK");

		console.log(
			`[wallet-smoke] reading agent USDC balance (agent=${wallet.agentAddress})`,
		);
		const balance = await wallet.getBalanceUsdc(wallet.agentAddress);
		console.log(`[wallet-smoke] agent USDC balance = ${balance}`);

		if (!(balance > 0)) {
			throw new Error(
				`Agent wallet USDC balance is ${balance} — fund the agent's USDC associated token account on ${config.SOLANA_CLUSTER} and retry`,
			);
		}

		console.log("[wallet-smoke] OK");
	} finally {
		await ResponderModel.findByIdAndDelete(responderId);
		await mongoose.disconnect();
	}
}

main().catch((err: unknown) => {
	console.error("[wallet-smoke] failed:", err);
	process.exit(1);
});
