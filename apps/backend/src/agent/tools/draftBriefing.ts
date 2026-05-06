import { PayoutBreakdownSchema } from "@roam/shared";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

// Input shape for the agent's terminal tool call. Mirrors BriefingSchema with
// runner-owned fields stripped: _id, generatedAt, generatedByModel, and
// briefingHash are filled by the runner. We also leave incidentId off — the
// runner already knows it (the agent was invoked *for* a specific incident),
// so requiring the model to echo it back just creates a mismatch failure mode.
export const DraftBriefingInputSchema = z.object({
	summary: z
		.string()
		.min(1, "summary is required")
		.describe(
			"Concise dispatch summary the dispatcher will read on the briefing card.",
		),
	recommendedVehicleIds: z
		.array(z.string())
		.min(1, "recommend at least one vehicle")
		.describe(
			"Ordered (highest-priority first) list of vehicle IDs to dispatch. IDs must come from find_nearest_vehicles.",
		),
	recommendedResponderIds: z
		.array(z.string())
		.min(1, "recommend at least one responder")
		.describe(
			"Ordered list of responder IDs, taken from the assignedResponderIds of the recommended vehicles.",
		),
	payout: PayoutBreakdownSchema.describe(
		"USDC payout breakdown: baseUsdc, urgencyMultiplier, hazmatMultiplier, distanceMultiplier, totalUsdc.",
	),
});
export type DraftBriefingInput = z.infer<typeof DraftBriefingInputSchema>;

const DRAFT_BRIEFING_DESCRIPTION =
	"Emit the final dispatch briefing once you have classified the incident, picked vehicles + responders, and computed the payout. Call this exactly once at the end of the run; the dispatcher reviews a single draft.";

// Tool envelope handed to runAgent's `tools` parameter. Distinct from the
// AD-5 read-only tools (which use the AgentTool<TInput, TOutput> shape and
// run through dispatchToolCall): draftBriefing is a *terminal* tool — its
// "result" is just an acknowledgement; the runner pulls the validated payload
// out of the registry instead of reading the tool result.
export const draftBriefingTool = {
	name: "draft_briefing",
	description: DRAFT_BRIEFING_DESCRIPTION,
	inputSchema: DraftBriefingInputSchema,
	inputSchemaJson: zodToJsonSchema(DraftBriefingInputSchema) as Record<
		string,
		unknown
	>,
	// Validate-only handler. Throwing here surfaces as a tool_result with
	// is_error: true (see llm.ts), so the model can see the validation
	// message and try again rather than crashing the run.
	handler(input: unknown): DraftBriefingInput {
		return DraftBriefingInputSchema.parse(input);
	},
};
