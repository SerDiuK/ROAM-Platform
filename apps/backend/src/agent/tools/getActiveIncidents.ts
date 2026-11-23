import {
	type IncidentStatus,
	IncidentStatusSchema,
	IncidentUrgencySchema,
} from "@roam/shared";
import { z } from "zod";
import { IncidentModel } from "../../db/models/incident.js";
import type { AgentTool } from "./types.js";

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

export const getActiveIncidentsTool: AgentTool<Input, OutputItem[]> = {
	name: "get_active_incidents",
	description:
		"Return every incident currently in flight (status = live, pending, or responding). Use this before recommending a vehicle to avoid double-dispatching a unit that is already assigned to another scene. Terminal incidents (resolved/cancelled) are excluded.",
	inputSchema: InputSchema,
	handler: async () => {
		const docs = await IncidentModel.find({
			status: { $in: ACTIVE_STATUSES },
		})
			.sort({ callStartedAt: -1 })
			.lean();

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
