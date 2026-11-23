import { ORPCError } from "@orpc/client";
import type { Briefing, Dispatch, Incident, Responder } from "@roam/shared";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { SeekerAuthorizationError, SeekerSigningError } from "@/lib/mwa";
import { DispatchInbox, type DispatchInboxApi } from "./dispatch-inbox.js";

vi.mock("react-native", () => ({
	Platform: { OS: "ios" },
}));

const RESPONDER_ID = "rsp-1";

function makeDispatch(overrides: Partial<Dispatch> = {}): Dispatch {
	return {
		_id: "dsp-1",
		incidentId: "inc-1",
		briefingId: "br-1",
		decisionMaker: "human",
		decidedAt: new Date("2026-05-06T12:00:00Z"),
		assignedVehicleIds: ["veh-1"],
		assignedResponderIds: [RESPONDER_ID, "rsp-2"],
		requiredAccepts: 1,
		status: "pending",
		claimedByResponderIds: [],
		expiresAt: new Date("2026-05-06T12:01:00Z"),
		...overrides,
	};
}

function makeIncident(): Incident {
	return {
		_id: "inc-1",
		callStartedAt: new Date("2026-05-06T11:59:00Z"),
		transcript: "...",
		transcriptHash: "abc",
		classification: {
			incidentType: "Cardiac arrest",
			urgency: 1,
			locationDescription: "Collins Ave & 21st St",
			requiredCapabilities: ["medic"],
		},
		status: "responding",
		assigned: { vehicles: ["veh-1"], responders: [RESPONDER_ID] },
		createdAt: new Date("2026-05-06T11:59:00Z"),
		updatedAt: new Date("2026-05-06T12:00:00Z"),
	};
}

function makeBriefing(): Briefing {
	return {
		_id: "br-1",
		incidentId: "inc-1",
		generatedAt: new Date("2026-05-06T11:59:30Z"),
		generatedByModel: "test",
		summary: "Pt. unresponsive, bystander performing CPR",
		recommendedVehicleIds: ["veh-1"],
		recommendedResponderIds: [RESPONDER_ID],
		briefingHash: "deadbeef",
	};
}

function makeResponder(id: string, name: string): Responder {
	return {
		_id: id,
		name,
		role: "responder",
		availability: "available",
		capabilities: ["medic"],
	};
}

type MockedApi = {
	[K in keyof DispatchInboxApi]: Mock<DispatchInboxApi[K]>;
};

function makeApi(): MockedApi {
	return {
		getDispatch: vi.fn<DispatchInboxApi["getDispatch"]>(),
		getIncident: vi.fn<DispatchInboxApi["getIncident"]>(),
		listResponders: vi.fn<DispatchInboxApi["listResponders"]>(),
		respond: vi.fn<DispatchInboxApi["respond"]>(),
		clear: vi.fn<DispatchInboxApi["clear"]>(),
	};
}

function seedHappy(api: ReturnType<typeof makeApi>): void {
	api.getDispatch.mockResolvedValue(makeDispatch());
	api.getIncident.mockResolvedValue({
		incident: makeIncident(),
		briefing: makeBriefing(),
	});
	api.listResponders.mockResolvedValue([
		makeResponder(RESPONDER_ID, "A. van Gaal"),
		makeResponder("rsp-2", "T. Smith"),
		makeResponder("rsp-other", "Unrelated"),
	]);
}

describe("DispatchInbox", () => {
	let api: ReturnType<typeof makeApi>;
	let forgetDevice: Mock<() => Promise<void>>;
	let inbox: DispatchInbox;

	beforeEach(() => {
		api = makeApi();
		forgetDevice = vi.fn(async () => {});
		inbox = new DispatchInbox({
			api,
			getResponderId: () => RESPONDER_ID,
			forgetDevice,
		});
	});

	it("starts idle", () => {
		expect(inbox.getState().kind).toBe("idle");
	});

	it("fetches dispatch + incident + responders on showFor and exposes them as `incoming`", async () => {
		seedHappy(api);
		await inbox.showFor("dsp-1");

		expect(api.getDispatch).toHaveBeenCalledWith("dsp-1");
		expect(api.getIncident).toHaveBeenCalledWith("inc-1");
		expect(api.listResponders).toHaveBeenCalledTimes(1);

		const state = inbox.getState();
		expect(state.kind).toBe("incoming");
		if (state.kind !== "incoming") return;
		expect(state.data.dispatch._id).toBe("dsp-1");
		expect(state.data.briefing?.summary).toContain("CPR");
		expect(state.data.responders.map((r) => r._id)).toEqual([
			RESPONDER_ID,
			"rsp-2",
		]);
	});

	it("notifies subscribers on every state transition", async () => {
		seedHappy(api);
		const listener = vi.fn();
		inbox.subscribe(listener);

		await inbox.showFor("dsp-1");

		expect(listener.mock.calls.length).toBeGreaterThanOrEqual(2);
	});

	it("acceptDispatch calls respond with decision='accept' and transitions to `claimed`", async () => {
		seedHappy(api);
		api.respond.mockResolvedValue(undefined);
		await inbox.showFor("dsp-1");
		await inbox.acceptDispatch();

		expect(api.respond).toHaveBeenCalledWith({
			dispatchId: "dsp-1",
			decision: "accept",
			declineReason: undefined,
		});
		expect(inbox.getState().kind).toBe("claimed");
	});

	it("declineDispatch calls respond with decision='decline' and dismisses", async () => {
		seedHappy(api);
		api.respond.mockResolvedValue(undefined);
		await inbox.showFor("dsp-1");
		await inbox.declineDispatch("too far");

		expect(api.respond).toHaveBeenCalledWith({
			dispatchId: "dsp-1",
			decision: "decline",
			declineReason: "too far",
		});
		expect(inbox.getState().kind).toBe("idle");
	});

	it("surfaces CONFLICT as a typed error state without crashing", async () => {
		seedHappy(api);
		api.respond.mockRejectedValue(
			new ORPCError("CONFLICT", { message: "dispatch_already_claimed" }),
		);
		await inbox.showFor("dsp-1");
		await inbox.acceptDispatch();

		const state = inbox.getState();
		expect(state.kind).toBe("conflict");
		if (state.kind !== "conflict") return;
		expect(state.message).toBe("dispatch_already_claimed");
		expect(state.data.dispatch._id).toBe("dsp-1");
	});

	it("forgets the device only when the Seeker refuses authorization", async () => {
		seedHappy(api);
		api.respond.mockRejectedValueOnce(
			new SeekerSigningError("Transaction declined"),
		);
		await inbox.showFor("dsp-1");
		await inbox.acceptDispatch();

		expect(inbox.getState().kind).toBe("error");
		expect(forgetDevice).not.toHaveBeenCalled();

		api.respond.mockRejectedValueOnce(
			new SeekerAuthorizationError("Authorization failed"),
		);
		await inbox.showFor("dsp-1");
		await inbox.acceptDispatch();

		expect(forgetDevice).toHaveBeenCalledTimes(1);
	});

	it("ignores stale fetch results when showFor is called twice in quick succession", async () => {
		const slowDispatch = makeDispatch({ _id: "dsp-old" });
		const fastDispatch = makeDispatch({ _id: "dsp-new" });

		const firstResolver: { fn: ((value: Dispatch) => void) | null } = {
			fn: null,
		};
		api.getDispatch.mockImplementationOnce(
			() =>
				new Promise<Dispatch>((resolve) => {
					firstResolver.fn = resolve;
				}),
		);
		api.getDispatch.mockImplementationOnce(async () => fastDispatch);
		api.getIncident.mockResolvedValue({
			incident: makeIncident(),
			briefing: makeBriefing(),
		});
		api.listResponders.mockResolvedValue([
			makeResponder(RESPONDER_ID, "A. van Gaal"),
		]);

		const stale = inbox.showFor("dsp-old");
		await inbox.showFor("dsp-new");

		const after = inbox.getState();
		expect(after.kind).toBe("incoming");
		if (after.kind !== "incoming") return;
		expect(after.data.dispatch._id).toBe("dsp-new");

		firstResolver.fn?.(slowDispatch);
		await stale;
		const final = inbox.getState();
		if (final.kind !== "incoming") return;
		expect(final.data.dispatch._id).toBe("dsp-new");
	});

	it("errors out when responderId is not yet known", async () => {
		const noIdInbox = new DispatchInbox({
			api,
			getResponderId: () => undefined,
			forgetDevice,
		});
		seedHappy(api);
		await noIdInbox.showFor("dsp-1");
		await noIdInbox.acceptDispatch();

		expect(api.respond).not.toHaveBeenCalled();
		expect(noIdInbox.getState().kind).toBe("error");
	});

	it("clearDispatch from claimed runs the chain ceremony and dismisses on success", async () => {
		seedHappy(api);
		api.respond.mockResolvedValue(undefined);
		api.clear.mockResolvedValue(undefined);
		await inbox.showFor("dsp-1");
		await inbox.acceptDispatch();
		expect(inbox.getState().kind).toBe("claimed");

		await inbox.clearDispatch();

		expect(api.clear).toHaveBeenCalledWith({ dispatchId: "dsp-1" });
		expect(inbox.getState().kind).toBe("idle");
	});

	it("clearDispatch is a no-op outside the claimed state", async () => {
		seedHappy(api);
		await inbox.showFor("dsp-1");
		expect(inbox.getState().kind).toBe("incoming");

		await inbox.clearDispatch();
		expect(api.clear).not.toHaveBeenCalled();
		expect(inbox.getState().kind).toBe("incoming");
	});

	it("clearDispatch surfaces CONFLICT (e.g. dispatch already cleared)", async () => {
		seedHappy(api);
		api.respond.mockResolvedValue(undefined);
		api.clear.mockRejectedValue(
			new ORPCError("CONFLICT", {
				message: "dispatch_not_claimable_for_clear: status=cleared",
			}),
		);
		await inbox.showFor("dsp-1");
		await inbox.acceptDispatch();
		await inbox.clearDispatch();

		const state = inbox.getState();
		expect(state.kind).toBe("conflict");
	});

	it("dismiss() returns to idle and a new showFor restarts the flow cleanly", async () => {
		seedHappy(api);
		await inbox.showFor("dsp-1");
		expect(inbox.getState().kind).toBe("incoming");

		inbox.dismiss();
		expect(inbox.getState().kind).toBe("idle");

		await inbox.showFor("dsp-1");
		expect(inbox.getState().kind).toBe("incoming");
	});
});
