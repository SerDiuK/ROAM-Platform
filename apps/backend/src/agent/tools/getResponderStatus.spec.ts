import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ResponderModel } from "../../db/models/responder.js";
import { getResponderStatusTool } from "./getResponderStatus.js";
import type { AgentToolContext } from "./types.js";

const ctx = { log: {} as AgentToolContext["log"] } satisfies AgentToolContext;

async function makeResp(args: {
	name: string;
	availability?: "available" | "occupied" | "off_duty";
	capabilities?: "medic"[];
}): Promise<string> {
	const id = randomUUID();
	await new ResponderModel({
		_id: id,
		name: args.name,
		role: "responder",
		availability: args.availability ?? "available",
		capabilities: args.capabilities,
	}).save();
	return id;
}

describe("getResponderStatusTool", () => {
	it("returns availability and capabilities per known responder", async () => {
		const aliceId = await makeResp({
			name: "ALICE",
			availability: "available",
			capabilities: ["medic"],
		});
		const bobId = await makeResp({
			name: "BOB",
			availability: "occupied",
			capabilities: ["medic"],
		});

		const result = await getResponderStatusTool.handler(
			{ responderIds: [aliceId, bobId] },
			ctx,
		);

		expect(result).toHaveLength(2);
		const byId = new Map(result.map((r) => [r.id, r]));
		expect(byId.get(aliceId)).toEqual({
			id: aliceId,
			name: "ALICE",
			availability: "available",
			capabilities: ["medic"],
		});
		expect(byId.get(bobId)).toEqual({
			id: bobId,
			name: "BOB",
			availability: "occupied",
			capabilities: ["medic"],
		});
	});

	it("drops unknown responder IDs instead of throwing", async () => {
		const realId = await makeResp({
			name: "REAL",
			capabilities: ["medic"],
		});

		const result = await getResponderStatusTool.handler(
			{ responderIds: [realId, "ghost-id-1", "ghost-id-2"] },
			ctx,
		);

		expect(result).toHaveLength(1);
		expect(result[0].id).toBe(realId);
	});

	it("returns capabilities=[] when the responder has none set", async () => {
		const id = await makeResp({ name: "NO-CAPS" });
		const result = await getResponderStatusTool.handler(
			{ responderIds: [id] },
			ctx,
		);
		expect(result[0].capabilities).toEqual([]);
	});
});
