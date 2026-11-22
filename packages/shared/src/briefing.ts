import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex } from "@noble/hashes/utils";
import { z } from "zod";

export const PayoutBreakdownSchema = z.object({
	baseUsdc: z.number(),
	urgencyMultiplier: z.number(),
	hazmatMultiplier: z.number(),
	distanceMultiplier: z.number(),
	totalUsdc: z.number(),
});
export type PayoutBreakdown = z.infer<typeof PayoutBreakdownSchema>;

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

// Must stay byte-stable: dispatch.confirm recomputes stored hashes. Array order is semantic.
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
