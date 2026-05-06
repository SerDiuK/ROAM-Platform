import { vi } from "vitest";
export function makeMockAnthropic(responses) {
    let i = 0;
    const calls = [];
    const create = vi.fn(async (args) => {
        calls.push({ args: structuredClone(args) });
        if (i >= responses.length) {
            throw new Error(`makeMockAnthropic: no more responses (used ${responses.length})`);
        }
        return responses[i++];
    });
    const client = { messages: { create } };
    return { client, create, calls };
}
export function fakeMessage(content, stopReason = "end_turn") {
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
    };
}
export function textBlock(text) {
    return { type: "text", text, citations: null };
}
export function toolUseBlock(name, input, id = `toolu_${Math.random().toString(36).slice(2, 10)}`) {
    return { type: "tool_use", id, name, input };
}
//# sourceMappingURL=anthropic-mock.js.map