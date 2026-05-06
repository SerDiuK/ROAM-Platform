import { randomUUID } from "node:crypto";
import { computeBriefingHash } from "@roam/shared";
import { BriefingModel, IncidentModel, ResponderModel, VehicleModel, } from "./db.js";
const DEFAULT_TRANSCRIPT = "Multi-vehicle crash at Biscayne Blvd & NE 36th St. Two cars, multiple injuries reported, possible entrapment.";
const DEFAULT_SUMMARY = "Multi-vehicle crash at Biscayne Blvd & NE 36th St. Two cars, multiple injuries, possible entrapment. Lights & sirens.";
// Inserts a synthetic Incident + Briefing pair with a valid briefingHash so
// dispatch.confirm passes the hash check. Bypasses the LLM agent — the agent
// path stays exercised by incidents.ingest in the real demo flow.
export async function seedBriefing(options = {}) {
    const responders = await ResponderModel.find({ role: "responder" })
        .limit(options.responderCount ?? 2)
        .lean();
    const vehicles = await VehicleModel.find()
        .limit(options.vehicleCount ?? 2)
        .lean();
    if (responders.length === 0 || vehicles.length === 0) {
        throw new Error("No seeded responders or vehicles found — run `pnpm --filter @roam/backend seed` first.");
    }
    const recommendedResponderIds = responders.map((r) => r._id);
    const recommendedVehicleIds = vehicles.map((v) => String(v._id));
    const summary = options.summary ?? DEFAULT_SUMMARY;
    const transcript = options.transcript ?? DEFAULT_TRANSCRIPT;
    const totalUsdc = options.totalUsdc ?? 25;
    const payout = {
        baseUsdc: 10,
        urgencyMultiplier: 2,
        hazmatMultiplier: 1,
        distanceMultiplier: 1.25,
        totalUsdc,
    };
    const incidentId = randomUUID();
    const briefingId = randomUUID();
    await IncidentModel.create({
        _id: incidentId,
        callStartedAt: new Date(),
        transcript,
        transcriptHash: "cli-seed-no-hash",
        classification: {
            incidentType: options.incidentType ?? "MVA — entrapment",
            urgency: 1,
            locationDescription: "Biscayne & NE 36th",
            requiredCapabilities: ["medic"],
        },
        status: "live",
        assigned: { vehicles: [], responders: [] },
    });
    await BriefingModel.create({
        _id: briefingId,
        incidentId,
        generatedAt: new Date(),
        generatedByModel: "cli-seed",
        summary,
        recommendedVehicleIds,
        recommendedResponderIds,
        payout,
        briefingHash: computeBriefingHash({
            summary,
            recommendedVehicleIds,
            recommendedResponderIds,
            payout,
        }),
    });
    return {
        incidentId,
        briefingId,
        recommendedResponderIds,
        recommendedVehicleIds,
        summary,
    };
}
//# sourceMappingURL=seed.js.map