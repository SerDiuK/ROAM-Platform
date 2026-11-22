import { describe, expect, it } from "vitest";
import {
	agentTools,
	dispatchToolCall,
	ToolInputValidationError,
	UnknownToolError,
} from "./index.js";
import type { AgentToolContext } from "./types.js";

const ctx = { log: {} as AgentToolContext["log"] } satisfies AgentToolContext;

describe("agentTools registry", () => {
	const expectedNames = [
		"classify_incident",
		"find_nearest_vehicles",
		"get_responder_status",
		"get_active_incidents",
	];

	it("exposes the four agent tools", () => {
		expect(agentTools.map((t) => t.name).sort()).toEqual(
			[...expectedNames].sort(),
		);
	});

	it("each entry has a non-empty description and a JSON-schema input_schema", () => {
		for (const tool of agentTools) {
			expect(tool.description.length).toBeGreaterThan(20);
			expect(tool.input_schema).toBeTypeOf("object");
			// JSON Schema for a Zod object surfaces type:'object' at the root.
			expect((tool.input_schema as { type?: string }).type).toBe("object");
		}
	});
});

describe("dispatchToolCall", () => {
	it("throws UnknownToolError for an unregistered tool name", async () => {
		await expect(
			dispatchToolCall("does_not_exist", {}, ctx),
		).rejects.toBeInstanceOf(UnknownToolError);
	});

	it("rejects with ToolInputValidationError when the input fails Zod validation", async () => {
		await expect(
			dispatchToolCall("classify_incident", { wrong: "shape" }, ctx),
		).rejects.toBeInstanceOf(ToolInputValidationError);
	});

	it("routes by name and returns the tool's typed output for valid input", async () => {
		const result = await dispatchToolCall(
			"classify_incident",
			{ transcript: "There is a fire, smoke is everywhere." },
			ctx,
		);
		expect(result).toMatchObject({
			incidentType: "Structure fire",
			urgency: 1,
		});
	});
});
