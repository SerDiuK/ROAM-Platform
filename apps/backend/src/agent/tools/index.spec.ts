import { describe, expect, it } from "vitest";
import {
	dispatchToolCall,
	ToolInputValidationError,
	UnknownToolError,
} from "./index.js";
import type { AgentToolContext } from "./types.js";

const ctx = {
	log: {} as AgentToolContext["log"],
	incidentId: "inc-being-briefed",
} satisfies AgentToolContext;

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
