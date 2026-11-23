import { describe, expect, it, vi } from "vitest";
import {
	fakeMessage,
	makeMockAnthropic,
	textBlock,
	toolUseBlock,
} from "../../test/anthropic-mock.js";
import { runAgent } from "./llm.js";

const baseArgs = {
	model: "claude-opus-4-7",
	maxTokens: 1024,
	systemPrompt: "test system",
	userMessage: "test user",
	tools: [],
};

describe("runAgent", () => {
	it("terminates at maxTurns when the model never stops calling tools", async () => {
		const responses = Array.from({ length: 10 }, () =>
			fakeMessage(
				[toolUseBlock("classify_incident", { transcript: "x" })],
				"tool_use",
			),
		);
		const { client, create } = makeMockAnthropic(responses);
		const onTool = vi.fn(async () => ({ ok: true }));

		const result = await runAgent({
			...baseArgs,
			client,
			onTool,
			maxTurns: 3,
		});

		expect(result.stoppedAtMaxTurns).toBe(true);
		expect(result.turns).toBe(3);
		expect(create).toHaveBeenCalledTimes(3);
		expect(onTool).toHaveBeenCalledTimes(3);
	});

	it("invokes onTool for each tool_use block and threads the result into the next turn", async () => {
		const responses = [
			fakeMessage(
				[
					toolUseBlock("classify_incident", { transcript: "x" }, "tu_1"),
					toolUseBlock("get_active_incidents", {}, "tu_2"),
				],
				"tool_use",
			),
			fakeMessage([textBlock("done")], "end_turn"),
		];
		const { client, calls } = makeMockAnthropic(responses);
		const onTool = vi
			.fn()
			.mockResolvedValueOnce({ value: "first" })
			.mockResolvedValueOnce({ value: "second" });

		const result = await runAgent({
			...baseArgs,
			client,
			onTool,
			maxTurns: 5,
		});

		expect(result.stoppedAtMaxTurns).toBe(false);
		expect(result.turns).toBe(2);
		expect(onTool).toHaveBeenCalledTimes(2);
		expect(onTool).toHaveBeenNthCalledWith(1, "classify_incident", {
			transcript: "x",
		});
		expect(onTool).toHaveBeenNthCalledWith(2, "get_active_incidents", {});

		expect(result.toolCalls).toHaveLength(2);
		expect(result.toolCalls[0]).toMatchObject({
			name: "classify_incident",
			result: { value: "first" },
			isError: false,
		});
		expect(result.toolCalls[1]).toMatchObject({
			name: "get_active_incidents",
			result: { value: "second" },
			isError: false,
		});

		const secondCall = calls[1].args as {
			messages: { role: string; content: unknown }[];
		};
		const tail = secondCall.messages[secondCall.messages.length - 1];
		expect(tail.role).toBe("user");
		expect(tail.content).toEqual([
			expect.objectContaining({
				type: "tool_result",
				tool_use_id: "tu_1",
				content: JSON.stringify({ value: "first" }),
			}),
			expect.objectContaining({
				type: "tool_result",
				tool_use_id: "tu_2",
				content: JSON.stringify({ value: "second" }),
			}),
		]);
	});

	it("surfaces tool errors as a tool_result with is_error: true and lets the loop continue", async () => {
		const responses = [
			fakeMessage([toolUseBlock("broken_tool", {}, "tu_err")], "tool_use"),
			fakeMessage([textBlock("recovered")], "end_turn"),
		];
		const { client, calls } = makeMockAnthropic(responses);
		const onTool = vi.fn().mockRejectedValueOnce(new Error("boom"));

		const result = await runAgent({
			...baseArgs,
			client,
			onTool,
			maxTurns: 3,
		});

		expect(result.stoppedAtMaxTurns).toBe(false);
		expect(result.turns).toBe(2);
		expect(result.toolCalls).toHaveLength(1);
		expect(result.toolCalls[0]).toMatchObject({
			name: "broken_tool",
			isError: true,
			error: "boom",
		});

		const secondCall = calls[1].args as {
			messages: { role: string; content: { type: string }[] }[];
		};
		const tail = secondCall.messages[secondCall.messages.length - 1];
		expect(tail.content[0]).toMatchObject({
			type: "tool_result",
			tool_use_id: "tu_err",
			content: "boom",
			is_error: true,
		});
	});

	it("short-circuits when the model calls a terminal tool, skipping the trailing turn", async () => {
		const responses = [
			fakeMessage(
				[
					toolUseBlock("classify_incident", { transcript: "x" }, "tu_a"),
					toolUseBlock("draft_briefing", { ok: true }, "tu_b"),
				],
				"tool_use",
			),
		];
		const { client, create } = makeMockAnthropic(responses);
		const onTool = vi.fn(async () => ({ ok: true }));

		const result = await runAgent({
			...baseArgs,
			client,
			onTool,
			maxTurns: 5,
			terminalToolName: "draft_briefing",
		});

		expect(create).toHaveBeenCalledTimes(1);
		expect(result.turns).toBe(1);
		expect(result.stoppedAtMaxTurns).toBe(false);
		expect(onTool).toHaveBeenCalledTimes(2);
		expect(result.toolCalls).toHaveLength(2);
	});

	it("returns immediately when the model emits text only (no tool_use)", async () => {
		const responses = [fakeMessage([textBlock("nothing to do")], "end_turn")];
		const { client } = makeMockAnthropic(responses);
		const onTool = vi.fn();

		const result = await runAgent({
			...baseArgs,
			client,
			onTool,
			maxTurns: 5,
		});

		expect(result.stoppedAtMaxTurns).toBe(false);
		expect(result.turns).toBe(1);
		expect(result.toolCalls).toHaveLength(0);
		expect(onTool).not.toHaveBeenCalled();
	});
});
