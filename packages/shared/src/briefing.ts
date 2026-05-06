import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex } from "@noble/hashes/utils";
import { z } from "zod";

// --- Payout Breakdown ---
// Agent-computed multipliers applied to the base USDC bounty.
export const PayoutBreakdownSchema = z.object({
	baseUsdc: z.number(),
	urgencyMultiplier: z.number(),
	hazmatMultiplier: z.number(),
	distanceMultiplier: z.number(),
	totalUsdc: z.number(),
});
export type PayoutBreakdown = z.infer<typeof PayoutBreakdownSchema>;

// --- Briefing ---
// The agent's draft. `briefingHash` is sha256 of the canonicalized payload
// (summary + recommendations + payout) and is what the dispatcher confirms
// against — guarantees the on-chain record matches the briefing reviewed.
export const BriefingSchema = z.object({
	_id: z.string(),
	incidentId: z.string(),
	generatedAt: z.coerce.date(),
	generatedByModel: z.string(),
	summary: z.string(),
	recommendedVehicleIds: z.array(z.string()),
	recommendedResponderIds: z.array(z.string()),
	payout: PayoutBreakdownSchema,
	briefingHash: z.string(),
});
export type Briefing = z.infer<typeof BriefingSchema>;

// --- Briefing hash (canonical sha256) ---
// Stable sha256 over the canonicalized payload (summary + recommendations +
// payout). The dispatcher confirms against this hash, and the on-chain record
// commits to it — so the *same* draft always produces the *same* hash, and
// any byte change to the user-visible payload changes it.
//
// Lives in shared so both the backend agent runner and any external tool
// (CLI, mobile, dashboard) can recompute the hash for verification without
// re-implementing the canonicalization.
export type BriefingHashPayload = Pick<
	Briefing,
	"summary" | "recommendedVehicleIds" | "recommendedResponderIds" | "payout"
>;

export function computeBriefingHash(payload: BriefingHashPayload): string {
	const canonical = canonicalizeBriefingPayload({
		summary: payload.summary,
		recommendedVehicleIds: payload.recommendedVehicleIds,
		recommendedResponderIds: payload.recommendedResponderIds,
		payout: payload.payout,
	});
	return bytesToHex(sha256(canonical));
}

// Deterministic JSON: object keys sorted lexicographically, arrays preserved
// in order (recommendation order is semantic — first item is highest
// priority), primitives go through JSON.stringify so escaping matches.
function canonicalizeBriefingPayload(value: unknown): string {
	if (value === null || typeof value !== "object") {
		return JSON.stringify(value);
	}
	if (Array.isArray(value)) {
		return `[${value.map(canonicalizeBriefingPayload).join(",")}]`;
	}
	const obj = value as Record<string, unknown>;
	const keys = Object.keys(obj).sort();
	const parts = keys.map(
		(k) => `${JSON.stringify(k)}:${canonicalizeBriefingPayload(obj[k])}`,
	);
	return `{${parts.join(",")}}`;
}
