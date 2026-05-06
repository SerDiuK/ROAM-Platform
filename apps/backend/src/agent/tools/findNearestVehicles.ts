import { ResponderCapabilitySchema } from "@roam/shared";
import type { Types } from "mongoose";
import { z } from "zod";
import { ResponderModel } from "../../db/models/responder.js";
import { VehicleModel } from "../../db/models/vehicle.js";
import type { AgentTool } from "./types.js";

// Geo-bounded vehicle lookup for the dispatch agent. Backed by the 2dsphere
// index on `vehicles.lastTelemetry.location` (see db/models/vehicle.ts) so the
// query plan stays sub-millisecond even as the fleet grows.
//
// Capability filtering is two-stage on purpose. Capabilities live on Responder
// docs, but the agent dispatches a Vehicle (the Responder is along for the
// ride). So we first resolve the set of qualifying responder IDs by capability,
// then ask Mongo for the nearest Vehicles whose `assignedResponderIds` overlap
// that set. If no responders match, we short-circuit to an empty result rather
// than running the geo query — saves a round trip.

const InputSchema = z.object({
	lat: z.number().min(-90).max(90),
	lon: z.number().min(-180).max(180),
	radiusKm: z.number().positive().max(1000),
	requiredCapabilities: z.array(ResponderCapabilitySchema).optional(),
});
type Input = z.infer<typeof InputSchema>;

const OutputItemSchema = z.object({
	id: z.string(),
	callsign: z.string(),
	distanceMeters: z.number(),
	assignedResponderIds: z.array(z.string()),
});
type OutputItem = z.infer<typeof OutputItemSchema>;

// Aggregation result shape: $geoNear injects distanceMeters, the rest mirrors
// the vehicle document. _id is an ObjectId at the Mongo layer.
interface NearbyVehicleDoc {
	_id: Types.ObjectId;
	callsign: string;
	assignedResponderIds?: string[];
	distanceMeters: number;
}

const MAX_RESULTS = 5;

export const findNearestVehiclesTool: AgentTool<Input, OutputItem[]> = {
	name: "find_nearest_vehicles",
	description: `Return up to ${MAX_RESULTS} available vehicles nearest to a (lat, lon) within radiusKm. Optional requiredCapabilities filters to vehicles whose assigned responders include at least one of the listed capabilities. Results are ordered nearest-first with explicit distanceMeters.`,
	inputSchema: InputSchema,
	handler: async ({ lat, lon, radiusKm, requiredCapabilities }) => {
		let qualifyingResponderIds: string[] | null = null;
		if (requiredCapabilities && requiredCapabilities.length > 0) {
			const ops = await ResponderModel.find({
				capabilities: { $in: requiredCapabilities },
			})
				.select({ _id: 1 })
				.lean();
			// Responder _id is overridden to String in the schema (see responder.ts);
			// the default Mongoose typing assumes ObjectId, so cast to the runtime
			// shape.
			qualifyingResponderIds = (ops as unknown as { _id: string }[]).map(
				(o) => o._id,
			);
			if (qualifyingResponderIds.length === 0) return [];
		}

		const match: Record<string, unknown> = { status: "available" };
		if (qualifyingResponderIds) {
			match.assignedResponderIds = { $in: qualifyingResponderIds };
		}

		const docs = (await VehicleModel.aggregate([
			{
				$geoNear: {
					near: { type: "Point", coordinates: [lon, lat] },
					distanceField: "distanceMeters",
					maxDistance: radiusKm * 1000,
					spherical: true,
					query: match,
				},
			},
			{ $limit: MAX_RESULTS },
		])) as NearbyVehicleDoc[];

		return docs.map((d) => ({
			id: d._id.toHexString(),
			callsign: d.callsign,
			distanceMeters: d.distanceMeters,
			assignedResponderIds: d.assignedResponderIds ?? [],
		}));
	},
};
