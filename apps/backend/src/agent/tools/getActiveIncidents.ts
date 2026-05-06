import {
	type IncidentStatus,
	IncidentStatusSchema,
	type IncidentUrgency,
	IncidentUrgencySchema,
} from "@roam/shared";
import { z } from "zod";
import { IncidentModel } from "../../db/models/incident.js";
import type { AgentTool } from "./types.js";

// What still has units committed to it. The agent calls this before drafting
// a briefing so it can avoid pulling a vehicle that is already responding to
// another scene.
//
// The plan called these "live or briefed". The modern AD-1 enum doesn't have
// "briefed" — its equivalent is `pending` (briefing drafted, awaiting
// confirm). We also include `responding` so the agent sees vehicles that are
// already committed and would otherwise be double-dispatched. Terminal states
// (resolved / cancelled) are excluded.

const ACTIVE_STATUSES: readonly IncidentStatus[] = [
	"live",
	"pending",
	"responding",
] as const;

const InputSchema = z.object({}).strict();
type Input = z.infer<typeof InputSchema>;

const OutputItemSchema = z.object({
	id: z.string(),
	status: IncidentStatusSchema,
	urgency: IncidentUrgencySchema.optional(),
	incidentType: z.string().optional(),
	locationDescription: z.string().optional(),
	assignedVehicleIds: z.array(z.string()),
	assignedResponderIds: z.array(z.string()),
	callStartedAt: z.string(),
});
type OutputItem = z.infer<typeof OutputItemSchema>;

interface IncidentLeanDoc {
	_id: string;
	status: IncidentStatus;
	callStartedAt: Date;
	classification?: {
		incidentType?: string;
		urgency?: IncidentUrgency;
		locationDescription?: string;
	};
	assigned?: {
		vehicles?: string[];
		responders?: string[];
	};
}

export const getActiveIncidentsTool: AgentTool<Input, OutputItem[]> = {
	name: "get_active_incidents",
	description:
		"Return every incident currently in flight (status = live, pending, or responding). Use this before recommending a vehicle to avoid double-dispatching a unit that is already assigned to another scene. Terminal incidents (resolved/cancelled) are excluded.",
	inputSchema: InputSchema,
	handler: async () => {
		const docs = (await IncidentModel.find({
			status: { $in: ACTIVE_STATUSES },
		})
			.sort({ callStartedAt: -1 })
			.lean()) as unknown as IncidentLeanDoc[];

		return docs.map((d) => ({
			id: d._id,
			status: d.status,
			urgency: d.classification?.urgency,
			incidentType: d.classification?.incidentType,
			locationDescription: d.classification?.locationDescription,
			assignedVehicleIds: d.assigned?.vehicles ?? [],
			assignedResponderIds: d.assigned?.responders ?? [],
			callStartedAt: d.callStartedAt.toISOString(),
		}));
	},
};
