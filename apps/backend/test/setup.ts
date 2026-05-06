import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll, vi } from "vitest";

vi.mock("../src/services/solana.js", () => ({
	withSolanaProvider: vi.fn(async () => null),
}));

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
