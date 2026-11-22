import { zodToJsonSchema } from "zod-to-json-schema";
import { classifyIncidentTool } from "./classifyIncident.js";
import { findNearestVehiclesTool } from "./findNearestVehicles.js";
import { getActiveIncidentsTool } from "./getActiveIncidents.js";
import { getResponderStatusTool } from "./getResponderStatus.js";
import type { AgentTool, AgentToolContext } from "./types.js";

// biome-ignore lint/suspicious/noExplicitAny: registry needs to hold heterogeneous tools
type AnyAgentTool = AgentTool<any, unknown>;

const TOOLS: AnyAgentTool[] = [
	classifyIncidentTool,
	findNearestVehiclesTool,
	getResponderStatusTool,
	getActiveIncidentsTool,
];

const TOOLS_BY_NAME = new Map<string, AnyAgentTool>(
	TOOLS.map((t) => [t.name, t]),
);

export interface AgentToolDefinition {
	name: string;
	description: string;
	input_schema: Record<string, unknown>;
}

export const agentTools: AgentToolDefinition[] = TOOLS.map((t) => ({
	name: t.name,
	description: t.description,
	input_schema: zodToJsonSchema(t.inputSchema) as Record<string, unknown>,
}));

export class UnknownToolError extends Error {
	readonly toolName: string;
	constructor(toolName: string) {
		super(`Unknown agent tool: ${toolName}`);
		this.name = "UnknownToolError";
		this.toolName = toolName;
	}
}

export class ToolInputValidationError extends Error {
	readonly toolName: string;
	readonly issues: unknown;
	constructor(toolName: string, issues: unknown) {
		super(`Invalid input for tool '${toolName}'`);
		this.name = "ToolInputValidationError";
		this.toolName = toolName;
		this.issues = issues;
	}
}

export async function dispatchToolCall(
	name: string,
	input: unknown,
	ctx: AgentToolContext,
): Promise<unknown> {
	const tool = TOOLS_BY_NAME.get(name);
	if (!tool) throw new UnknownToolError(name);

	const parsed = tool.inputSchema.safeParse(input);
	if (!parsed.success) {
		throw new ToolInputValidationError(name, parsed.error.issues);
	}

	return tool.handler(parsed.data, ctx);
}

export type { AgentTool, AgentToolContext } from "./types.js";
