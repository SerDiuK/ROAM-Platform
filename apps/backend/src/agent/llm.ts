import type Anthropic from "@anthropic-ai/sdk";

export interface AgentToolDefinition {
	name: string;
	description: string;
	input_schema: Record<string, unknown>;
}

interface AgentToolCall {
	name: string;
	input: unknown;
	result?: unknown;
	error?: string;
	isError: boolean;
}

type OnTool = (name: string, input: unknown) => Promise<unknown>;

export type AgentEffort = "low" | "medium" | "high" | "max" | "xhigh";

interface RunAgentArgs {
	client: Anthropic;
	model: string;
	maxTokens: number;
	systemPrompt: string;
	userMessage: string;
	tools: AgentToolDefinition[];
	onTool: OnTool;
	maxTurns: number;
	effort?: AgentEffort;
	thinking?: Anthropic.ThinkingConfigParam;
	terminalToolName?: string;
	onTurn?: (info: {
		turn: number;
		ms: number;
		toolUseCount: number;
		usage: Anthropic.Usage;
	}) => void;
}

interface RunAgentResult {
	finalMessage: Anthropic.Message;
	toolCalls: AgentToolCall[];
	turns: number;
	stoppedAtMaxTurns: boolean;
}

export async function runAgent(args: RunAgentArgs): Promise<RunAgentResult> {
	if (args.maxTurns < 1) {
		throw new Error("runAgent: maxTurns must be at least 1");
	}

	const messages: Anthropic.MessageParam[] = [
		{ role: "user", content: args.userMessage },
	];
	const toolCalls: AgentToolCall[] = [];
	let lastResponse: Anthropic.Message | undefined;
	let turns = 0;

	for (let turn = 0; turn < args.maxTurns; turn++) {
		turns = turn + 1;
		const turnStart = Date.now();
		// Don't mark `messages` in place: markers would pile up past the API's limit of 4 breakpoints.
		const messagesWithCache = withTrailingUserCacheControl(messages);
		const response = await args.client.messages.create({
			model: args.model,
			max_tokens: args.maxTokens,
			system: [
				{
					type: "text",
					text: args.systemPrompt,
					cache_control: { type: "ephemeral" },
				},
			],
			// zod-to-json-schema types its output wider than the SDK's InputSchema; every tool input is a z.object.
			tools: args.tools as unknown as Anthropic.ToolUnion[],
			messages: messagesWithCache,
			...(args.thinking ? { thinking: args.thinking } : {}),
			...(args.effort ? { output_config: { effort: args.effort } } : {}),
		});
		args.onTurn?.({
			turn: turns,
			ms: Date.now() - turnStart,
			toolUseCount: response.content.filter((b) => b.type === "tool_use")
				.length,
			usage: response.usage,
		});
		lastResponse = response;

		// Keep every block: tool_use pairs with next turn's tool_result; thinking blocks must be passed back.
		messages.push({ role: "assistant", content: response.content });

		const toolUseBlocks = response.content.filter(
			(b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
		);

		if (toolUseBlocks.length === 0) {
			return {
				finalMessage: response,
				toolCalls,
				turns,
				stoppedAtMaxTurns: false,
			};
		}

		const toolResults: Anthropic.ToolResultBlockParam[] = [];
		for (const block of toolUseBlocks) {
			try {
				const result = await args.onTool(block.name, block.input);
				toolCalls.push({
					name: block.name,
					input: block.input,
					result,
					isError: false,
				});
				toolResults.push({
					type: "tool_result",
					tool_use_id: block.id,
					content: JSON.stringify(result),
				});
			} catch (err) {
				const errMsg = err instanceof Error ? err.message : String(err);
				toolCalls.push({
					name: block.name,
					input: block.input,
					error: errMsg,
					isError: true,
				});
				toolResults.push({
					type: "tool_result",
					tool_use_id: block.id,
					content: errMsg,
					is_error: true,
				});
			}
		}

		if (
			args.terminalToolName &&
			toolUseBlocks.some((b) => b.name === args.terminalToolName)
		) {
			return {
				finalMessage: response,
				toolCalls,
				turns,
				stoppedAtMaxTurns: false,
			};
		}

		messages.push({ role: "user", content: toolResults });
	}

	if (!lastResponse) {
		throw new Error("runAgent: no response captured (internal invariant)");
	}
	return {
		finalMessage: lastResponse,
		toolCalls,
		turns,
		stoppedAtMaxTurns: true,
	};
}

function withTrailingUserCacheControl(
	messages: Anthropic.MessageParam[],
): Anthropic.MessageParam[] {
	let lastUserIdx = -1;
	for (let i = messages.length - 1; i >= 0; i--) {
		if (messages[i].role === "user") {
			lastUserIdx = i;
			break;
		}
	}
	if (lastUserIdx === -1) return messages;

	const out: Anthropic.MessageParam[] = messages.slice();
	const last = out[lastUserIdx];

	if (typeof last.content === "string") {
		out[lastUserIdx] = {
			role: "user",
			content: [
				{
					type: "text",
					text: last.content,
					cache_control: { type: "ephemeral" },
				},
			],
		};
		return out;
	}

	const blocks = last.content.slice();
	const tail = blocks[blocks.length - 1];
	blocks[blocks.length - 1] = {
		...tail,
		cache_control: { type: "ephemeral" },
	} as typeof tail;
	out[lastUserIdx] = { role: "user", content: blocks };
	return out;
}
