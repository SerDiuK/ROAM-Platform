import type Anthropic from "@anthropic-ai/sdk";
import { vi } from "vitest";
export interface MockAnthropicClient {
    client: Anthropic;
    create: ReturnType<typeof vi.fn>;
    calls: {
        args: unknown;
    }[];
}
export declare function makeMockAnthropic(responses: Anthropic.Message[]): MockAnthropicClient;
export declare function fakeMessage(content: Anthropic.ContentBlock[], stopReason?: Anthropic.Message["stop_reason"]): Anthropic.Message;
export declare function textBlock(text: string): Anthropic.TextBlock;
export declare function toolUseBlock(name: string, input: unknown, id?: string): Anthropic.ToolUseBlock;
//# sourceMappingURL=anthropic-mock.d.ts.map