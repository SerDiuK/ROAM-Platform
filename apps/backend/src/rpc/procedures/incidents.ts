import { createHash, randomUUID } from "node:crypto";
import { ORPCError } from "@orpc/server";
import type { Briefing, Incident } from "@roam/shared";
import { brief } from "../../agent/runner.js";
import { classifyIncidentTool } from "../../agent/tools/classifyIncident.js";
import { BriefingModel } from "../../db/models/briefing.js";
import { IncidentModel } from "../../db/models/incident.js";
import { recordIncidentEvent } from "../../services/incidentEvents.js";
import type { RpcContext } from "../context.js";
import { os } from "../builder.js";

const RECENT_LIMIT = 20;

// Wide ceiling for the agent's tool-use loop. Sized for the AD-6 smoke run on
// Sonnet 4.6 — leaves headroom for thinking blocks and a `draft_briefing`
// payload with multi-paragraph summary + 3+ unit recommendations.
const AGENT_MAX_TOKENS = 16384;

export const incidentsRouter = {
	list: os.incidents.list.handler(async () => {
		const docs = await IncidentModel.find()
			.sort({ callStartedAt: -1 })
			.limit(RECENT_LIMIT)
			.lean();
		// Coerce ObjectId/Date instances to wire shape (string/ISO) the same way
		// smoke-models.ts does — Incident._id is already a string, but timestamps
		// are Date objects until JSON-serialized.
		return JSON.parse(JSON.stringify(docs)) as Incident[];
	}),

	get: os.incidents.get.handler(async ({ input }) => {
		const incident = await IncidentModel.findById(input.id).lean();
		if (!incident) {
			throw new ORPCError("NOT_FOUND", {
				message: `Incident not found: ${input.id}`,
			});
		}
		// An incident can be re-briefed as the call evolves; surface only the
		// most recent briefing so the dispatcher always sees the agent's latest
		// recommendation. AD-7 only generates one briefing per incident, but
		// this keeps post-AD-7 evolutions cheap.
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

		// Run the rule-based classifier before persisting so the dashboard's
		// incident row can render urgency + type + locationDescription on first
		// poll, and so the briefing agent skips its own classify_incident
		// round-trip (see prompts.ts: "do NOT call classify_incident unless the
		// classification is missing"). The agent can still override mid-loop if
		// the rule output is obviously wrong for the transcript.
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
			// Unreachable — we just created it on the same connection. If this
			// ever fires, MongoDB has bigger problems than this handler.
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

// Kicks off the AI briefing agent without blocking the ingest response. The
// dispatcher subscribes to /ws/incidents and renders the briefing when
// `briefing.ready` arrives. On failure we log and broadcast a `briefing.failed`
// event so the UI can surface it instead of spinning forever.
function runBriefingAgent(context: RpcContext, incidentId: string): void {
	// effort: "low" matches the smoke-script choice — Sonnet 4.6 defaults to
	// "high" which makes the dispatch loop ~3x slower than necessary for
	// routine tool routing (see runner.ts BriefContext docstring).
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

// Either decode + transcribe an audio buffer, or pass the supplied transcript
// straight through. Validation that exactly one is provided lives on the Zod
// schema (IncidentIngestRequestSchema) so anything that reaches this function
// has already been narrowed.
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
