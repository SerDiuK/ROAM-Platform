import type Anthropic from "@anthropic-ai/sdk";

// Tool envelope as the agent sees it — name + description + JSON Schema.
// We accept the shape `agentTools` already produces (see tools/index.ts) so
// callers don't need to massage anything.
export interface AgentToolDefinition {
	name: string;
	description: string;
	input_schema: Record<string, unknown>;
}

// One entry per tool_use block the model emitted across the entire run, in
// invocation order. `result` is populated on success; `error` carries the
// error message on failure (and the corresponding tool_result was sent back
// with is_error: true so the model can recover).
export interface AgentToolCall {
	name: string;
	input: unknown;
	result?: unknown;
	error?: string;
	isError: boolean;
}

export type OnTool = (name: string, input: unknown) => Promise<unknown>;

export type AgentEffort = "low" | "medium" | "high" | "max" | "xhigh";

export interface RunAgentArgs {
	client: Anthropic;
	model: string;
	maxTokens: number;
	systemPrompt: string;
	userMessage: string;
	tools: AgentToolDefinition[];
	onTool: OnTool;
	maxTurns: number;
	// Optional speed/quality knobs. `effort` gates how much reasoning the
	// model does per turn — Sonnet 4.6 defaults to "high", which makes the
	// dispatch loop ~3x slower than necessary for routine tool routing; use
	// "low" for the demo path. `thinking` defaults to off; only flip it on
	// when the agent is doing genuinely novel reasoning (it doubles latency).
	effort?: AgentEffort;
	thinking?: Anthropic.ThinkingConfigParam;
	// Tool name that ends the run as soon as the model calls it. Once it's
	// dispatched, we return immediately without sending the tool_result back
	// — the caller has already captured what it needed (via onTool), and the
	// extra round trip just produces a "task complete" text the user never
	// sees. For the dispatch agent this is "draft_briefing", which saves
	// ~30-40% of wall time on Sonnet.
	terminalToolName?: string;
	// Optional per-turn telemetry hook — useful for the smoke script to see
	// where the wall clock is going. Called after each model response, before
	// the tools run.
	onTurn?: (info: {
		turn: number;
		ms: number;
		toolUseCount: number;
		usage: Anthropic.Usage;
	}) => void;
}

export interface RunAgentResult {
	finalMessage: Anthropic.Message;
	toolCalls: AgentToolCall[];
	turns: number;
	stoppedAtMaxTurns: boolean;
}

// Drives the Anthropic Messages API in a tool-use loop. Terminates when the
// model returns no tool_use blocks (natural end-of-turn) OR when we hit
// maxTurns — the runner above us decides whether either outcome is acceptable.
//
// Why we always append the full `response.content` (not just text): tool_use
// blocks must be paired with their matching tool_result on the next turn, and
// thinking blocks (if adaptive thinking is enabled) must be preserved for the
// model to reason continuously across turns.
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
		// Apply two cache_control breakpoints per request:
		//
		//   1. End of system block — caches tools + system as a stable
		//      prefix that lives across brief() calls within the 5-min TTL.
		//   2. Last block of the most-recent user message — caches the
		//      growing conversation prefix within a single brief(), so
		//      turn N+1 reads what turn N just wrote.
		//
		// We freshly compute placement (2) each turn rather than mutating
		// `messages` in place, because moving the marker on each turn means
		// we can't accumulate stale markers (max 4 breakpoints per request).
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
			tools: args.tools as unknown as Anthropic.ToolUnion[],
			messages: messagesWithCache,
			...(args.thinking ? { thinking: args.thinking } : {}),
			...(args.effort
				? { output_config: { effort: args.effort } }
				: {}),
		});
		args.onTurn?.({
			turn: turns,
			ms: Date.now() - turnStart,
			toolUseCount: response.content.filter((b) => b.type === "tool_use")
				.length,
			usage: response.usage,
		});
		lastResponse = response;

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

		// Short-circuit: if the model called the designated terminal tool,
		// the caller has already captured the payload via onTool. Sending
		// the tool_result back just costs one more inference for the model
		// to type "done", which is wasted latency.
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
		// Unreachable — the loop always sets lastResponse when maxTurns >= 1.
		throw new Error("runAgent: no response captured (internal invariant)");
	}
	return {
		finalMessage: lastResponse,
		toolCalls,
		turns,
		stoppedAtMaxTurns: true,
	};
}

// Returns a shallow-copied messages array where the *last* user message
// carries a cache_control: ephemeral breakpoint on its final content block.
// Earlier user messages are returned unchanged (no markers) — moving the
// marker each turn keeps the breakpoint count bounded at 2 (system +
// trailing user) regardless of conversation length.
//
// String content gets converted to a single text block so the marker has
// a place to attach. Returns the input unchanged if no user message exists
// or the prefix is unlikely to be cacheable.
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

	// Array content — clone and append cache_control to the last block.
	const blocks = last.content.slice();
	const tail = blocks[blocks.length - 1];
	blocks[blocks.length - 1] = {
		...tail,
		cache_control: { type: "ephemeral" },
	} as typeof tail;
	out[lastUserIdx] = { role: "user", content: blocks };
	return out;
}
