import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { parseConfig } from "../src/config.js";
import { connectDb } from "../src/db/connection.js";
import { ResponderModel } from "../src/db/models/responder.js";
import { createExpoPushClient } from "../src/push/expo.js";

async function main(): Promise<void> {
	const [flag, value] = process.argv.slice(2);
	const name = flag === "--name" ? value : undefined;
	const pushToken = flag === "--token" ? value : undefined;
	if (!name && !pushToken) {
		throw new Error(
			"Usage: pnpm push:smoke -- --name <responder> | --token <ExponentPushToken[...]>",
		);
	}

	const config = parseConfig();
	await connectDb(config.MONGODB_URL, console);

	const client = createExpoPushClient({
		accessToken: config.EXPO_ACCESS_TOKEN,
	});

	let responderId: string;
	let cleanupTempResponder = false;

	if (name) {
		const responder = await ResponderModel.findOne({ name }).lean();
		if (!responder) {
			throw new Error(
				`No responder with name "${name}" — boot the mobile app first so it enrols and registers its push token`,
			);
		}
		const tokens = responder.pushTokens ?? [];
		if (tokens.length === 0) {
			throw new Error(
				`Responder "${name}" has no registered push tokens — confirm the mobile app called responders.upsertPushToken on boot`,
			);
		}
		responderId = responder._id;
		console.log(
			`[push-smoke] targeting responder ${name} (${responderId}) with ${tokens.length} token(s)`,
		);
	} else {
		if (!pushToken) {
			throw new Error("Pass --name or --token");
		}
		responderId = randomUUID();
		const tempName = `push-smoke-${responderId.slice(0, 8)}`;
		console.log(
			`[push-smoke] creating temp responder ${tempName} (${responderId})`,
		);
		await ResponderModel.create({
			_id: responderId,
			name: tempName,
			role: "responder",
			availability: "off_duty",
			pushTokens: [pushToken],
		});
		cleanupTempResponder = true;
	}

	try {
		console.log("[push-smoke] sending test dispatch notification...");
		const result = await client.sendPushToResponders([responderId], {
			title: "Test dispatch",
			body: "Smoke test from push-smoke.ts — confirm it arrived on the device",
			data: { type: "test", at: new Date().toISOString() },
		});

		console.log(
			`[push-smoke] delivered=${result.delivered} skipped=${result.skipped}`,
		);
		console.log(
			"[push-smoke] tickets:",
			JSON.stringify(result.tickets, null, 2),
		);

		const errors = result.tickets.filter((t) => t.status === "error");
		if (errors.length > 0) {
			throw new Error(
				`Expo returned ${errors.length} error ticket(s); see output above`,
			);
		}
		if (result.delivered === 0) {
			throw new Error(
				"No tokens were delivered — check that the registered token is a valid Expo push token",
			);
		}

		console.log("[push-smoke] OK — confirm delivery on the device");
	} finally {
		if (cleanupTempResponder) {
			await ResponderModel.findByIdAndDelete(responderId);
		}
		await mongoose.disconnect();
	}
}

main().catch((err: unknown) => {
	console.error("[push-smoke] failed:", err);
	process.exit(1);
});
