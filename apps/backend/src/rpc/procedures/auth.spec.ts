import { call, ORPCError } from "@orpc/server";
import { beforeEach, describe, expect, it } from "vitest";
import {
	makeFakeBroadcaster,
	makeFakeLogger,
	makeResponder,
	makeVehicle,
} from "../../../test/factories.js";
import {
	mockedWithSolanaProvider,
	resetSolanaMock,
} from "../../../test/mocks/solana.js";
import type { Config } from "../../config.js";
import { ResponderModel } from "../../db/models/responder.js";
import { VehicleModel } from "../../db/models/vehicle.js";
import type { AuthedUser, RpcContext } from "../context.js";
import { authRouter } from "./auth.js";

const fakeConfig = {
	SOLANA_OPERATOR_KEYPAIR: undefined,
	SOLANA_CLUSTER: "devnet",
} as unknown as Config;

const fakeUser: AuthedUser = {
	id: "test-responder",
	name: "TEST",
	role: "responder",
};

function buildContext(user: AuthedUser | null = fakeUser): RpcContext {
	return {
		config: fakeConfig,
		incidentBroadcaster:
			makeFakeBroadcaster() as unknown as RpcContext["incidentBroadcaster"],
		dispatchBroadcaster:
			makeFakeBroadcaster() as unknown as RpcContext["dispatchBroadcaster"],
		walletProvider: {} as RpcContext["walletProvider"],
		transcriber: {} as RpcContext["transcriber"],
		anthropic: {} as RpcContext["anthropic"],
		pushClient: {} as RpcContext["pushClient"],
		log: makeFakeLogger() as unknown as RpcContext["log"],
		user,
	};
}

describe("auth.checkin", () => {
	beforeEach(() => {
		resetSolanaMock();
	});

	it("sets currentVehicleId, flips vehicle to in_use, and does NOT touch Solana", async () => {
		const responder = await makeResponder({ name: "ALPHA-1" });
		const vehicle = await makeVehicle({ callsign: "V-1" });

		const result = await call(
			authRouter.checkin,
			{ vehicleId: vehicle._id.toHexString(), responderName: "ALPHA-1" },
			{ context: buildContext() },
		);

		expect(result.vehicle._id).toBe(vehicle._id.toHexString());
		expect(result.vehicle.status).toBe("in_use");
		expect(result.vehicle.currentResponderId).toBe(responder._id);
		expect(result.responder.name).toBe("ALPHA-1");

		const updatedVehicle = await VehicleModel.findById(vehicle._id);
		expect(updatedVehicle?.status).toBe("in_use");

		const updatedResponder = await ResponderModel.findById(responder._id);
		expect(updatedResponder?.currentVehicleId).toBe(vehicle._id.toHexString());

		expect(mockedWithSolanaProvider).not.toHaveBeenCalled();
	});

	it("rejects when vehicle is not found", async () => {
		await makeResponder({ name: "ALPHA-3" });

		await expect(
			call(
				authRouter.checkin,
				{
					vehicleId: "507f1f77bcf86cd799439099",
					responderName: "ALPHA-3",
				},
				{ context: buildContext() },
			),
		).rejects.toMatchObject({
			code: "NOT_FOUND",
			message: "vehicle_not_found",
		});
	});

	it("rejects when vehicle is already in_use", async () => {
		await makeResponder({ name: "ALPHA-4" });
		const vehicle = await makeVehicle({ callsign: "V-4", status: "in_use" });

		await expect(
			call(
				authRouter.checkin,
				{
					vehicleId: vehicle._id.toHexString(),
					responderName: "ALPHA-4",
				},
				{ context: buildContext() },
			),
		).rejects.toMatchObject({
			code: "CONFLICT",
			message: "vehicle_not_available",
		});
	});

	it("rejects when responder is already checked in", async () => {
		const responder = await makeResponder({
			name: "ALPHA-5",
			currentVehicleId: "507f1f77bcf86cd799439098",
		});
		const targetVehicle = await makeVehicle({ callsign: "V-5b" });

		await expect(
			call(
				authRouter.checkin,
				{
					vehicleId: targetVehicle._id.toHexString(),
					responderName: "ALPHA-5",
				},
				{ context: buildContext() },
			),
		).rejects.toMatchObject({
			code: "CONFLICT",
			message: "responder_already_checked_in",
		});

		const target = await VehicleModel.findById(targetVehicle._id);
		expect(target?.status).toBe("available");

		const after = await ResponderModel.findById(responder._id);
		expect(after?.currentVehicleId).toBe("507f1f77bcf86cd799439098");
	});

	it("only one of two concurrent checkins on the same vehicle wins", async () => {
		await makeResponder({ name: "RACE-A" });
		await makeResponder({ name: "RACE-B" });
		const vehicle = await makeVehicle({ callsign: "V-RACE" });

		const results = await Promise.allSettled([
			call(
				authRouter.checkin,
				{
					vehicleId: vehicle._id.toHexString(),
					responderName: "RACE-A",
				},
				{ context: buildContext() },
			),
			call(
				authRouter.checkin,
				{
					vehicleId: vehicle._id.toHexString(),
					responderName: "RACE-B",
				},
				{ context: buildContext() },
			),
		]);

		const fulfilled = results.filter((r) => r.status === "fulfilled");
		const rejected = results.filter((r) => r.status === "rejected");

		expect(fulfilled).toHaveLength(1);
		expect(rejected).toHaveLength(1);

		const error = (rejected[0] as PromiseRejectedResult).reason;
		expect(error).toBeInstanceOf(ORPCError);
		expect(["vehicle_not_available", "responder_already_checked_in"]).toContain(
			(error as ORPCError<string, unknown>).message,
		);

		const updatedVehicle = await VehicleModel.findById(vehicle._id);
		expect(updatedVehicle?.status).toBe("in_use");

		const checkedIn = await ResponderModel.find({
			currentVehicleId: vehicle._id.toHexString(),
		});
		expect(checkedIn).toHaveLength(1);
	});
});

describe("auth.checkout", () => {
	beforeEach(() => {
		resetSolanaMock();
	});

	it("clears currentVehicleId, frees vehicle, and does NOT touch Solana", async () => {
		const vehicle = await makeVehicle({ callsign: "VB-1", status: "in_use" });
		const responder = await makeResponder({
			name: "BETA-1",
			currentVehicleId: vehicle._id.toHexString(),
		});

		const result = await call(
			authRouter.checkout,
			{ vehicleId: vehicle._id.toHexString() },
			{ context: buildContext() },
		);

		expect(result.vehicle._id).toBe(vehicle._id.toHexString());
		expect(result.vehicle.status).toBe("available");
		expect(result.vehicle.currentResponderId).toBeNull();

		const updatedVehicle = await VehicleModel.findById(vehicle._id);
		expect(updatedVehicle?.status).toBe("available");

		const updatedResponder = await ResponderModel.findById(responder._id);
		expect(updatedResponder?.currentVehicleId).toBeNull();

		expect(mockedWithSolanaProvider).not.toHaveBeenCalled();
	});

	it("rejects when no responder is checked in to the vehicle", async () => {
		const vehicle = await makeVehicle({ callsign: "VB-2" });

		await expect(
			call(
				authRouter.checkout,
				{ vehicleId: vehicle._id.toHexString() },
				{ context: buildContext() },
			),
		).rejects.toMatchObject({
			code: "CONFLICT",
			message: "not_checked_in",
		});
	});

	it("re-checkin works after checkout", async () => {
		const vehicle = await makeVehicle({ callsign: "VB-3", status: "in_use" });
		const responder = await makeResponder({
			name: "BETA-3",
			currentVehicleId: vehicle._id.toHexString(),
		});

		await call(
			authRouter.checkout,
			{ vehicleId: vehicle._id.toHexString() },
			{ context: buildContext() },
		);

		const second = await call(
			authRouter.checkin,
			{ vehicleId: vehicle._id.toHexString(), responderName: "BETA-3" },
			{ context: buildContext() },
		);

		expect(second.vehicle.status).toBe("in_use");
		expect(second.vehicle.currentResponderId).toBe(responder._id);
	});
});
