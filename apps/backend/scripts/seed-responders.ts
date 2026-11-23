import { randomUUID } from "node:crypto";
import { DEMO_RESPONDERS } from "@roam/shared";
import mongoose from "mongoose";
import { parseConfig } from "../src/config.js";
import { connectDb } from "../src/db/connection.js";
import { ResponderModel } from "../src/db/models/responder.js";

async function main(): Promise<void> {
	const config = parseConfig();
	await connectDb(config.MONGODB_URL, console);

	for (const seed of DEMO_RESPONDERS) {
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

		await ResponderModel.findByIdAndUpdate(responder._id, {
			displayName: seed.displayName,
			role: seed.role,
			availability: seed.availability,
			capabilities: seed.role === "responder" ? ["medic"] : [],
		});

		console.log(
			`[seed-responders] ${seed.displayName} (login=${seed.name}, ${seed.role}) — id=${responder._id}`,
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
