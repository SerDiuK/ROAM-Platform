import type { z } from "zod";
import type { MinimalLogger } from "../../db/connection.js";

export interface AgentToolContext {
	log: MinimalLogger;
}

export interface AgentTool<TInput, TOutput> {
	name: string;
	description: string;
	inputSchema: z.ZodType<TInput>;
	handler(input: TInput, ctx: AgentToolContext): Promise<TOutput>;
}
