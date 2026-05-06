import {
	type ResponderAvailability,
	ResponderAvailabilitySchema,
	type ResponderCapability,
	ResponderCapabilitySchema,
} from "@roam/shared";
import { z } from "zod";
import { ResponderModel } from "../../db/models/responder.js";
import type { AgentTool } from "./types.js";

// Status lookup for a list of responder IDs. The agent uses this after
// findNearestVehicles to decide which crew is actually dispatchable —
// availability ('available' vs 'occupied' vs 'off_duty') is the gate, and
// `walletAddress: bool` is the precondition for the AD-11 USDC payout (no
// wallet means we can't route a payout, so the agent should pick someone
// else).
//
// Unknown IDs are dropped, not thrown. The agent's tool input is generated
// from prior tool results, but those may have been from a stale read; failing
// the whole call because one responder was deleted is the wrong default.

const InputSchema = z.object({
	responderIds: z.array(z.string().min(1)).min(1),
});
type Input = z.infer<typeof InputSchema>;

const OutputItemSchema = z.object({
	id: z.string(),
	name: z.string(),
	availability: ResponderAvailabilitySchema,
	capabilities: z.array(ResponderCapabilitySchema),
	walletAddress: z.boolean(),
});
type OutputItem = z.infer<typeof OutputItemSchema>;

// Lean shape — responder _id is a String (UUID) per schema override.
interface ResponderLeanDoc {
	_id: string;
	name: string;
	availability: ResponderAvailability;
	capabilities?: ResponderCapability[];
	walletAddress?: string;
}

export const getResponderStatusTool: AgentTool<Input, OutputItem[]> = {
	name: "get_responder_status",
	description:
		"Look up availability, capabilities, and wallet-provisioning status for a list of responder IDs. Returns one entry per known responder (unknown IDs are silently dropped). walletAddress is a boolean: true means the responder can receive USDC payouts.",
	inputSchema: InputSchema,
	handler: async ({ responderIds }) => {
		// Mongoose's lean() return type has _id: ObjectId by default, but the
		// Responder schema overrides _id to String (see db/models/responder.ts).
		// Cast to the local lean shape so the agent-tool output transform sees
		// the correct runtime types.
		const docs = (await ResponderModel.find({ _id: { $in: responderIds } })
			.select({
				_id: 1,
				name: 1,
				availability: 1,
				capabilities: 1,
				walletAddress: 1,
			})
			.lean()) as unknown as ResponderLeanDoc[];

		return docs.map((d) => ({
			id: d._id,
			name: d.name,
			availability: d.availability,
			capabilities: d.capabilities ?? [],
			walletAddress: typeof d.walletAddress === "string" && d.walletAddress.length > 0,
		}));
	},
};
