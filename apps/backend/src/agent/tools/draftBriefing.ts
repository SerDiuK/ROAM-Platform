import { PayoutBreakdownSchema } from "@roam/shared";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

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

export const draftBriefingTool = {
	name: "draft_briefing",
	description: DRAFT_BRIEFING_DESCRIPTION,
	inputSchema: DraftBriefingInputSchema,
	inputSchemaJson: zodToJsonSchema(DraftBriefingInputSchema) as Record<
		string,
		unknown
	>,
	handler(input: unknown): DraftBriefingInput {
		return DraftBriefingInputSchema.parse(input);
	},
};
