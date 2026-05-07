import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { parseConfig } from "../src/config.js";
import { connectDb } from "../src/db/connection.js";
import { ResponderModel } from "../src/db/models/responder.js";
import { createWalletProvider } from "../src/wallet/index.js";

// Seeds the canonical demo responders. Idempotent — safe to re-run.
//
// Run with:
//   pnpm --filter @roam/backend responders:seed
//
// Auth is Seeker-only (SIWS). `walletAddress` is bound on first sign-in
// from the device — no PIN, no pre-shared secret here.
//
// `name` is the login codename — short, uppercase. `displayName` is the real
// name shown in dashboards and on the responder's own mobile profile.

type Seed = {
	name: string;
	displayName: string;
	role: "responder" | "dispatcher";
	availability: "available" | "off_duty";
};

const SEEDS: Seed[] = [
	{
		name: "THOMAS-1",
		displayName: "Thomas Goethals",
		role: "responder",
		availability: "available",
	},
	{
		name: "RSP-1",
		displayName: "Alex Ramirez",
		role: "responder",
		availability: "available",
	},
	{
		name: "RSP-2",
		displayName: "Sam Patel",
		role: "responder",
		availability: "available",
	},
	{
		name: "DSP-1",
		displayName: "Mia Bennett",
		role: "dispatcher",
		availability: "off_duty",
	},
];

async function main(): Promise<void> {
	const config = parseConfig();
	await connectDb(config.MONGODB_URL, console);
	const wallet = createWalletProvider(config);

	for (const seed of SEEDS) {
		const existing = await ResponderModel.findOne({ name: seed.name });
		const responder =
			existing ??
			(await new ResponderModel({
				_id: randomUUID(),
				name: seed.name,
				displayName: seed.displayName,
				role: seed.role,
				availability: seed.availability,
			}).save());

		// Re-set role + availability + capabilities on every seed so flips between
		// responder/dispatcher land cleanly. Medic capability is the only one we
		// have today (see RESPONDER_CAPABILITIES in shared); dispatchers get it
		// cleared so they don't accidentally show up in find_nearest_vehicles.
		await ResponderModel.findByIdAndUpdate(responder._id, {
			displayName: seed.displayName,
			role: seed.role,
			availability: seed.availability,
			capabilities: seed.role === "responder" ? ["medic"] : [],
		});

		// Provision a wallet if missing (idempotent — see embedded.ts). Slated
		// for removal alongside AD-2 cleanup once payouts target the Seeker pubkey.
		const { address } = await wallet.createWallet(responder._id);

		console.log(
			`[seed-responders] ${seed.displayName} (login=${seed.name}, ${seed.role}) — id=${responder._id} wallet=${address}`,
		);
	}

	console.log(
		"[seed-responders] Auth is Seeker SIWS — bind walletAddress at first sign-in.",
	);
	await mongoose.disconnect();
}

main().catch((err: unknown) => {
	console.error("[seed-responders] failed:", err);
	process.exit(1);
});
