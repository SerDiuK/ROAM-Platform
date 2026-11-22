import { randomUUID } from "node:crypto";
import type Anthropic from "@anthropic-ai/sdk";
import {
	type Briefing,
	BriefingSchema,
	computeBriefingHash,
	type IncidentClassification,
} from "@roam/shared";
import type { MinimalLogger } from "../db/connection.js";
import { BriefingModel } from "../db/models/briefing.js";
import { IncidentModel } from "../db/models/incident.js";
import { type AgentEffort, type AgentToolDefinition, runAgent } from "./llm.js";
import { buildIncidentBriefingPrompt, buildSystemPrompt } from "./prompts.js";
import {
	type DraftBriefingInput,
	draftBriefingTool,
} from "./tools/draftBriefing.js";
import { agentTools, dispatchToolCall } from "./tools/index.js";

export { computeBriefingHash };

export class BriefError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "BriefError";
	}
}

export interface BriefContext {
	client: Anthropic;
	model: string;
	maxTokens: number;
	maxTurns: number;
	log: MinimalLogger;
	effort?: AgentEffort;
	thinking?: Anthropic.ThinkingConfigParam;
	onTurn?: (info: {
		turn: number;
		ms: number;
		toolUseCount: number;
		usage: Anthropic.Usage;
	}) => void;
}

interface IncidentLeanDoc {
	_id: string;
	transcript: string;
	classification?: IncidentClassification;
}

export async function brief(
	incidentId: string,
	ctx: BriefContext,
): Promise<Briefing> {
	const incident = (await IncidentModel.findById(incidentId)
		.select({ _id: 1, transcript: 1, classification: 1 })
		.lean()) as unknown as IncidentLeanDoc | null;
	if (!incident) {
		throw new BriefError(`Incident not found: ${incidentId}`);
	}

	const tools: AgentToolDefinition[] = [
		...agentTools,
		{
			name: draftBriefingTool.name,
			description: draftBriefingTool.description,
			input_schema: draftBriefingTool.inputSchemaJson,
		},
	];

	let draftPayload: DraftBriefingInput | undefined;

	const briefStart = Date.now();
	ctx.log.info(
		`brief[${incidentId}] start model=${ctx.model} maxTurns=${ctx.maxTurns} effort=${ctx.effort ?? "default"}`,
	);

	const { toolCalls, turns, stoppedAtMaxTurns } = await runAgent({
		client: ctx.client,
		model: ctx.model,
		maxTokens: ctx.maxTokens,
		systemPrompt: buildSystemPrompt(),
		userMessage: buildIncidentBriefingPrompt({
			transcript: incident.transcript,
			classification: incident.classification,
		}),
		tools,
		onTool: async (name, input) => {
			const toolStart = Date.now();
			ctx.log.info(`brief[${incidentId}] tool→ ${name} ${snippet(input)}`);
			try {
				let result: unknown;
				if (name === draftBriefingTool.name) {
					draftPayload = draftBriefingTool.handler(input);
					result = { ok: true };
				} else {
					result = await dispatchToolCall(name, input, { log: ctx.log });
				}
				ctx.log.info(
					`brief[${incidentId}] tool← ${name} ${Date.now() - toolStart}ms ${snippet(result)}`,
				);
				return result;
			} catch (err) {
				ctx.log.error(
					`brief[${incidentId}] tool✗ ${name} ${Date.now() - toolStart}ms ${err instanceof Error ? err.message : String(err)}`,
				);
				throw err;
			}
		},
		maxTurns: ctx.maxTurns,
		effort: ctx.effort,
		thinking: ctx.thinking,
		onTurn: (info) => {
			ctx.log.info(
				`brief[${incidentId}] turn=${info.turn} ${info.ms}ms tools=${info.toolUseCount} tokens=${info.usage.input_tokens}in/${info.usage.output_tokens}out`,
			);
			ctx.onTurn?.(info);
		},
		terminalToolName: draftBriefingTool.name,
	});

	ctx.log.info(
		`brief[${incidentId}] end ${Date.now() - briefStart}ms turns=${turns}/${ctx.maxTurns} maxedOut=${stoppedAtMaxTurns} toolCalls=${toolCalls.length} gotDraft=${draftPayload !== undefined}`,
	);

	if (!draftPayload) {
		throw new BriefError(
			`Agent did not call draft_briefing within ${ctx.maxTurns} turns (turns=${turns}, stoppedAtMaxTurns=${stoppedAtMaxTurns}, tool calls=${toolCalls.length})`,
		);
	}

	const briefing: Briefing = BriefingSchema.parse({
		_id: randomUUID(),
		incidentId,
		generatedAt: new Date(),
		generatedByModel: ctx.model,
		summary: draftPayload.summary,
		recommendedVehicleIds: draftPayload.recommendedVehicleIds,
		recommendedResponderIds: draftPayload.recommendedResponderIds,
		payout: draftPayload.payout,
		briefingHash: computeBriefingHash(draftPayload),
	});

	await BriefingModel.create(briefing);
	return briefing;
}

function snippet(value: unknown, max = 240): string {
	let s: string;
	try {
		s = JSON.stringify(value);
	} catch {
		s = String(value);
	}
	s = s.replace(/\s+/g, " ");
	return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
