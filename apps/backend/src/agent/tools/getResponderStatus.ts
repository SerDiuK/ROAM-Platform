import {
	ResponderAvailabilitySchema,
	ResponderCapabilitySchema,
} from "@roam/shared";
import { z } from "zod";
import { ResponderModel } from "../../db/models/responder.js";
import type { AgentTool } from "./types.js";

const InputSchema = z.object({
	responderIds: z.array(z.string().min(1)).min(1),
});
type Input = z.infer<typeof InputSchema>;

const OutputItemSchema = z.object({
	id: z.string(),
	name: z.string(),
	availability: ResponderAvailabilitySchema,
	capabilities: z.array(ResponderCapabilitySchema),
});
type OutputItem = z.infer<typeof OutputItemSchema>;

export const getResponderStatusTool: AgentTool<Input, OutputItem[]> = {
	name: "get_responder_status",
	description:
		"Look up availability and capabilities for a list of responder IDs. Returns one entry per known responder (unknown IDs are silently dropped).",
	inputSchema: InputSchema,
	handler: async ({ responderIds }) => {
		const docs = await ResponderModel.find({ _id: { $in: responderIds } })
			.select({
				_id: 1,
				name: 1,
				availability: 1,
				capabilities: 1,
			})
			.lean();

		return docs.map((d) => ({
			id: d._id,
			name: d.name,
			availability: d.availability,
			capabilities: d.capabilities ?? [],
		}));
	},
};
