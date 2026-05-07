// Smoke test for the x402 dispatch settlement flow.
// Creates a minimal cleared dispatch in Mongo, then calls POST /api/dispatch/complete
// which triggers the full x402 handshake: 402 challenge → native SOL transfer → Payout record.
//
// Usage: pnpm --filter @roam/backend x402:smoke
// Requires the backend to be running on PORT (default 3001).

import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { parseConfig } from "../src/config.js";
import { connectDb } from "../src/db/connection.js";
import { DispatchModel } from "../src/db/models/dispatch.js";
import { triggerX402Payment, SETTLEMENT_SOL } from "../src/x402/client.js";

async function main(): Promise<void> {
	const config = parseConfig();
	await connectDb(config.MONGODB_URL, console);

	// Create a minimal cleared dispatch so the middleware can look it up
	const dispatchId = randomUUID();
	const now = new Date();
	await DispatchModel.create({
		_id: dispatchId,
		incidentId: randomUUID(),
		briefingId: randomUUID(),
		decisionMaker: "human",
		decidedAt: now,
		assignedVehicleIds: [],
		assignedResponderIds: [],
		payoutUsdc: 0,
		requiredAccepts: 1,
		status: "cleared",
		claimedByResponderIds: [],
		expiresAt: new Date(now.getTime() + 60_000),
	});

	console.log(`\n✓ Created test dispatch: ${dispatchId}`);
	console.log(`  Amount: ${SETTLEMENT_SOL} SOL → ${config.X402_RECIPIENT_ADDRESS}`);
	console.log(`  Network: ${config.X402_NETWORK}\n`);
	console.log("Triggering x402 payment...\n");

	const sig = await triggerX402Payment(
		config,
		// Simple logger shim
		{
			info: (obj: unknown, msg?: string) => console.log("[info]", msg ?? obj, typeof obj === "object" ? obj : ""),
			error: (obj: unknown, msg?: string) => console.error("[error]", msg ?? obj, typeof obj === "object" ? obj : ""),
			warn: (obj: unknown, msg?: string) => console.warn("[warn]", msg ?? obj, typeof obj === "object" ? obj : ""),
			debug: () => {},
			trace: () => {},
			fatal: () => {},
			child: () => ({ info: () => {}, error: () => {}, warn: () => {}, debug: () => {}, trace: () => {}, fatal: () => {}, child: () => ({}) }),
		} as Parameters<typeof triggerX402Payment>[1],
		dispatchId,
	);

	console.log(`\n✓ Payment settled on-chain`);
	console.log(`  Solana tx: ${sig}`);
	console.log(`  View on explorer: https://solscan.io/tx/${sig}?cluster=devnet\n`);

	await mongoose.disconnect();
}

main().catch((err: unknown) => {
	console.error(err);
	process.exit(1);
});
