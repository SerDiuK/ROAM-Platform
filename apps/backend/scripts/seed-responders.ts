import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { hashPin } from "../src/auth/pin.js";
import { parseConfig } from "../src/config.js";
import { connectDb } from "../src/db/connection.js";
import { ResponderModel } from "../src/db/models/responder.js";
import { createWalletProvider } from "../src/wallet/index.js";

// Seeds the canonical demo responders. Idempotent — safe to re-run.
//
// Run with:
//   pnpm --filter @roam/backend responders:seed
//
// Env: SEED_PIN can override the default PIN. Demo runs with `0000` so the
// stage flow is "type four zeroes, sign in, go." Production seeding would
// require strong PINs and per-responder distribution out-of-band.
//
// `name` is the login codename — short, uppercase, easy to type on the mobile
// keypad with autoCapitalize. `displayName` is the real name shown in the
// dashboard and the responder's own mobile profile. Auth still matches on
// `name`.

const DEFAULT_PIN = process.env.SEED_PIN ?? "0000";

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

	const pinHash = await hashPin(DEFAULT_PIN);

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

		// Always re-set the pin hash + role on re-seed so demo flips between
		// responder/dispatcher land cleanly. Medic capability is the only one we
		// have today (see RESPONDER_CAPABILITIES in shared); dispatchers get it
		// cleared so they don't accidentally show up in find_nearest_vehicles.
		await ResponderModel.findByIdAndUpdate(responder._id, {
			displayName: seed.displayName,
			role: seed.role,
			availability: seed.availability,
			capabilities: seed.role === "responder" ? ["medic"] : [],
			pinHash,
		});

		// Provision a wallet if missing (idempotent — see embedded.ts).
		const { address } = await wallet.createWallet(responder._id);

		console.log(
			`[seed-responders] ${seed.displayName} (login=${seed.name}, ${seed.role}) — id=${responder._id} wallet=${address}`,
		);
	}

	console.log(`[seed-responders] PIN for all seeded responders: ${DEFAULT_PIN}`);
	await mongoose.disconnect();
}

main().catch((err: unknown) => {
	console.error("[seed-responders] failed:", err);
	process.exit(1);
});
