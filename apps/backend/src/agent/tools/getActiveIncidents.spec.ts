import { createHash } from "node:crypto";
import type { IncidentStatus } from "@roam/shared";
import { describe, expect, it } from "vitest";
import { IncidentModel } from "../../db/models/incident.js";
import { getActiveIncidentsTool } from "./getActiveIncidents.js";
import type { AgentToolContext } from "./types.js";

const ctx = { log: {} as AgentToolContext["log"] } satisfies AgentToolContext;

async function makeIncident(args: {
	id: string;
	status: IncidentStatus;
	callStartedAt: Date;
	incidentType?: string;
	locationDescription?: string;
}): Promise<void> {
	const transcript = `transcript-${args.id}`;
	await new IncidentModel({
		_id: args.id,
		callStartedAt: args.callStartedAt,
		transcript,
		transcriptHash: createHash("sha256").update(transcript).digest("hex"),
		status: args.status,
		assigned: { vehicles: [], responders: [] },
		...(args.incidentType
			? {
					classification: {
						incidentType: args.incidentType,
						urgency: 1,
						locationDescription: args.locationDescription,
						requiredCapabilities: [],
					},
				}
			: {}),
	}).save();
}

describe("getActiveIncidentsTool", () => {
	it("returns only live, pending, and responding incidents (excludes resolved + cancelled)", async () => {
		const now = Date.now();
		await makeIncident({
			id: "inc-live",
			status: "live",
			callStartedAt: new Date(now - 1_000),
		});
		await makeIncident({
			id: "inc-pending",
			status: "pending",
			callStartedAt: new Date(now - 2_000),
		});
		await makeIncident({
			id: "inc-responding",
			status: "responding",
			callStartedAt: new Date(now - 3_000),
		});
		await makeIncident({
			id: "inc-resolved",
			status: "resolved",
			callStartedAt: new Date(now - 4_000),
		});
		await makeIncident({
			id: "inc-cancelled",
			status: "cancelled",
			callStartedAt: new Date(now - 5_000),
		});

		const result = await getActiveIncidentsTool.handler({}, ctx);

		expect(result.map((r) => r.id)).toEqual([
			"inc-live",
			"inc-pending",
			"inc-responding",
		]);
		for (const r of result) {
			expect(["live", "pending", "responding"]).toContain(r.status);
		}
	});

	it("orders results by callStartedAt descending (newest first)", async () => {
		const base = Date.now();
		await makeIncident({
			id: "old",
			status: "live",
			callStartedAt: new Date(base - 60_000),
		});
		await makeIncident({
			id: "new",
			status: "live",
			callStartedAt: new Date(base),
		});
		await makeIncident({
			id: "mid",
			status: "live",
			callStartedAt: new Date(base - 30_000),
		});

		const result = await getActiveIncidentsTool.handler({}, ctx);
		expect(result.map((r) => r.id)).toEqual(["new", "mid", "old"]);
	});

	it("flattens classification fields and assigned arrays onto the result", async () => {
		await makeIncident({
			id: "inc-classified",
			status: "live",
			callStartedAt: new Date(),
			incidentType: "Hazmat incident",
			locationDescription: "Biscayne and 36th",
		});

		const result = await getActiveIncidentsTool.handler({}, ctx);
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			id: "inc-classified",
			status: "live",
			incidentType: "Hazmat incident",
			locationDescription: "Biscayne and 36th",
			urgency: 1,
			assignedVehicleIds: [],
			assignedResponderIds: [],
		});
		expect(typeof result[0].callStartedAt).toBe("string");
	});

	it("returns an empty array when no incidents are active", async () => {
		await makeIncident({
			id: "only-resolved",
			status: "resolved",
			callStartedAt: new Date(),
		});

		const result = await getActiveIncidentsTool.handler({}, ctx);
		expect(result).toEqual([]);
	});
});
