import type Anthropic from "@anthropic-ai/sdk";
import { vi } from "vitest";

// Tiny helper that lets specs build a mock Anthropic client by handing it a
// fixed sequence of Message responses. Each call to `messages.create()`
// returns the next one in order; running off the end is a test bug, so we
// surface it loudly.

export interface MockAnthropicClient {
	client: Anthropic;
	create: ReturnType<typeof vi.fn>;
	// Per-call snapshot of `messages.create()` args. Use this instead of
	// `create.mock.calls` for assertions — runAgent intentionally reuses one
	// `messages` array and mutates it between turns, so the SDK call args
	// captured by vi.fn are live references that look "wrong" by the time the
	// test asserts.
	calls: { args: unknown }[];
}

export function makeMockAnthropic(
	responses: Anthropic.Message[],
): MockAnthropicClient {
	let i = 0;
	const calls: { args: unknown }[] = [];
	const create = vi.fn(async (args: unknown) => {
		calls.push({ args: structuredClone(args) });
		if (i >= responses.length) {
			throw new Error(
				`makeMockAnthropic: no more responses (used ${responses.length})`,
			);
		}
		return responses[i++];
	});
	const client = { messages: { create } } as unknown as Anthropic;
	return { client, create, calls };
}

export function fakeMessage(
	content: Anthropic.ContentBlock[],
	stopReason: Anthropic.Message["stop_reason"] = "end_turn",
): Anthropic.Message {
	return {
		id: `msg_${Math.random().toString(36).slice(2, 10)}`,
		type: "message",
		role: "assistant",
		model: "claude-opus-4-7",
		content,
		stop_reason: stopReason,
		stop_sequence: null,
		usage: {
			input_tokens: 0,
			output_tokens: 0,
			cache_read_input_tokens: 0,
			cache_creation_input_tokens: 0,
			server_tool_use: null,
			service_tier: null,
		},
	} as unknown as Anthropic.Message;
}

export function textBlock(text: string): Anthropic.TextBlock {
	return { type: "text", text, citations: null } as Anthropic.TextBlock;
}

export function toolUseBlock(
	name: string,
	input: unknown,
	id = `toolu_${Math.random().toString(36).slice(2, 10)}`,
): Anthropic.ToolUseBlock {
	return { type: "tool_use", id, name, input } as Anthropic.ToolUseBlock;
}
