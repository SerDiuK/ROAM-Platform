import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll, vi } from "vitest";

// Keep the real `getSolanaContext` (no network — only in-memory keypair +
// Connection construction; the mocked solana-client helpers don't touch it).
// `withSolanaProvider` stays mocked to a no-op so backend-only chain writes
// (dispatch.confirm, recordIncidentEvent's async path) don't try to dial out.
vi.mock("../src/services/solana.js", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("../src/services/solana.js")>();
	return {
		...actual,
		withSolanaProvider: vi.fn(async () => null),
	};
});

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
	mongoServer = await MongoMemoryServer.create();
	await mongoose.connect(mongoServer.getUri());

	await import("../src/db/models/responder.js");
	await import("../src/db/models/vehicleSpec.js");
	await import("../src/db/models/vehicle.js");
	await import("../src/db/models/telemetry.js");
	await import("../src/db/models/incident.js");
	await import("../src/db/models/briefing.js");
	await import("../src/db/models/dispatch.js");
	await import("../src/db/models/dispatchResponse.js");

	await mongoose.connection.syncIndexes();
});

afterEach(async () => {
	const collections = mongoose.connection.collections;
	for (const key of Object.keys(collections)) {
		await collections[key].deleteMany({});
	}
});

afterAll(async () => {
	await mongoose.disconnect();
	await mongoServer.stop();
});
