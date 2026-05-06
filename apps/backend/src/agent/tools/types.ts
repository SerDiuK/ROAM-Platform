import type { z } from "zod";
import type { MinimalLogger } from "../../db/connection.js";

// Shared shape every agent tool plugs into. The agent runner (AD-6) builds
// `ctx` once per LLM turn and threads it through dispatchToolCall.
//
// `log` is intentionally narrow — tool handlers should call info/warn/error
// with a plain message. Structured logging stays with the production
// Fastify-typed callers; smoke scripts pass `console` directly.
export interface AgentToolContext {
	log: MinimalLogger;
}

// Per-tool definition. The Zod schema is the source of truth — the JSON Schema
// shipped to Anthropic is derived from it via zod-to-json-schema, and the
// dispatcher uses the same schema to validate the model's tool input before
// calling the handler.
export interface AgentTool<TInput, TOutput> {
	name: string;
	description: string;
	inputSchema: z.ZodType<TInput>;
	handler: (input: TInput, ctx: AgentToolContext) => Promise<TOutput>;
}
