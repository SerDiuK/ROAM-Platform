import { createHash, randomUUID } from "node:crypto";
import { ORPCError } from "@orpc/server";
import type { Briefing, Incident } from "@roam/shared";
import { brief } from "../../agent/runner.js";
import { classifyIncidentTool } from "../../agent/tools/classifyIncident.js";
import { BriefingModel } from "../../db/models/briefing.js";
import { IncidentModel } from "../../db/models/incident.js";
import { recordIncidentEvent } from "../../services/incidentEvents.js";
import { os } from "../builder.js";
import type { RpcContext } from "../context.js";

const RECENT_LIMIT = 20;

// Headroom for thinking blocks plus a multi-paragraph `draft_briefing` payload.
const AGENT_MAX_TOKENS = 16384;

export const incidentsRouter = {
	list: os.incidents.list.handler(async () => {
		const docs = await IncidentModel.find()
			.sort({ callStartedAt: -1 })
			.limit(RECENT_LIMIT)
			.lean();
		// JSON round-trip turns Date fields into the ISO strings of the wire type.
		return JSON.parse(JSON.stringify(docs)) as Incident[];
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
		return JSON.parse(
			JSON.stringify({ incident, briefing: briefing ?? undefined }),
		) as { incident: Incident; briefing?: Briefing };
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
			{ log: context.log },
		);

		await IncidentModel.create({
			_id: incidentId,
			callStartedAt: new Date(),
			transcript,
			transcriptHash,
			classification,
			status: "live",
			assigned: { vehicles: [], responders: [] },
		});
		const persisted = await IncidentModel.findById(incidentId).lean();
		if (!persisted) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Incident vanished after create",
			});
		}
		const incident = JSON.parse(JSON.stringify(persisted)) as Incident;

		context.incidentBroadcaster.broadcast({
			type: "incident.created",
			incident,
		});

		await recordIncidentEvent(
			{
				config: context.config,
				log: context.log,
				incidentBroadcaster: context.incidentBroadcaster,
			},
			{
				incidentId,
				kind: "received",
				occurredAt: new Date(persisted.callStartedAt),
			},
		);

		runBriefingAgent(context, incidentId);

		return incident;
	}),
};

function runBriefingAgent(context: RpcContext, incidentId: string): void {
	void brief(incidentId, {
		client: context.anthropic,
		model: context.config.ANTHROPIC_MODEL,
		maxTokens: AGENT_MAX_TOKENS,
		maxTurns: context.config.AGENT_MAX_TURNS,
		log: context.log,
		effort: "low",
	})
		.then((briefing) => {
			context.incidentBroadcaster.broadcast({
				type: "briefing.ready",
				incidentId,
				briefing: JSON.parse(JSON.stringify(briefing)) as Briefing,
			});
		})
		.catch((err: unknown) => {
			context.log.error({ err, incidentId }, "runBriefingAgent failed");
			context.incidentBroadcaster.broadcast({
				type: "briefing.failed",
				incidentId,
				error: err instanceof Error ? err.message : String(err),
			});
		});
}

async function resolveTranscript(
	input: { audio?: string; mimeType?: string; transcript?: string },
	context: RpcContext,
): Promise<string> {
	if (input.transcript !== undefined) {
		return input.transcript;
	}
	// Schema-enforced: when transcript is absent, audio + mimeType are present.
	const audioBuffer = Buffer.from(input.audio as string, "base64");
	const result = await context.transcriber.transcribeAudioFile(
		audioBuffer,
		input.mimeType as string,
	);
	return result.transcript;
}
