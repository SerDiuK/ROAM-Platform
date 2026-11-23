import { createHash, randomUUID } from "node:crypto";
import { ORPCError } from "@orpc/server";
import { BriefingSchema, IncidentSchema } from "@roam/shared";
import { AGENT_MAX_TOKENS, brief } from "../../agent/runner.js";
import { classifyIncidentTool } from "../../agent/tools/classifyIncident.js";
import { BriefingModel } from "../../db/models/briefing.js";
import { IncidentModel } from "../../db/models/incident.js";
import { toWire } from "../../db/serializers/wire.js";
import { recordIncidentEvent } from "../../services/incidentEvents.js";
import { os } from "../builder.js";
import type { RpcContext } from "../context.js";

const RECENT_LIMIT = 20;

export const incidentsRouter = {
	list: os.incidents.list.handler(async () => {
		const docs = await IncidentModel.find()
			.sort({ callStartedAt: -1 })
			.limit(RECENT_LIMIT)
			.lean();
		return docs.map((doc) => toWire(IncidentSchema, doc));
	}),

	get: os.incidents.get.handler(async ({ input }) => {
		const incident = await IncidentModel.findById(input.id).lean();
		if (!incident) {
			throw new ORPCError("NOT_FOUND", {
				message: `Incident not found: ${input.id}`,
			});
		}
		const briefing = await BriefingModel.findOne({ incidentId: input.id })
			.sort({ generatedAt: -1 })
			.lean();
		return {
			incident: toWire(IncidentSchema, incident),
			briefing: briefing ? toWire(BriefingSchema, briefing) : undefined,
		};
	}),

	ingest: os.incidents.ingest.handler(async ({ input, context }) => {
		const transcript = await resolveTranscript(input, context);
		const transcriptHash = createHash("sha256")
			.update(transcript)
			.digest("hex");
		const incidentId = randomUUID();

		// Classify before persisting: the dashboard shows it on first poll, and the
		// agent skips classify_incident when it's already set.
		const classification = await classifyIncidentTool.handler(
			{ transcript },
			{ log: context.log, incidentId },
		);

		const created = await IncidentModel.create({
			_id: incidentId,
			callStartedAt: new Date(),
			transcript,
			transcriptHash,
			classification,
			status: "live",
			assigned: { vehicles: [], responders: [] },
		});
		const incident = toWire(IncidentSchema, created);

		await recordIncidentEvent(
			{ config: context.config, log: context.log },
			{
				incidentId,
				kind: "received",
				occurredAt: incident.callStartedAt,
			},
		);

		runBriefingAgent(context, incidentId);

		return incident;
	}),
};

function runBriefingAgent(context: RpcContext, incidentId: string): void {
	brief(incidentId, {
		client: context.anthropic,
		model: context.config.ANTHROPIC_MODEL,
		maxTokens: AGENT_MAX_TOKENS,
		maxTurns: context.config.AGENT_MAX_TURNS,
		log: context.log,
		effort: "low",
	}).catch((err: unknown) => {
		context.log.error({ err, incidentId }, "runBriefingAgent failed");
	});
}

async function resolveTranscript(
	input: { audio?: string; mimeType?: string; transcript?: string },
	context: RpcContext,
): Promise<string> {
	if (input.transcript !== undefined) {
		return input.transcript;
	}
	if (input.audio === undefined || input.mimeType === undefined) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Provide exactly one of audio or transcript",
		});
	}
	const result = await context.transcriber.transcribeAudioFile(
		Buffer.from(input.audio, "base64"),
		input.mimeType,
	);
	return result.transcript;
}
