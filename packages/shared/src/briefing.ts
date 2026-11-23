import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex } from "@noble/hashes/utils";
import { z } from "zod";

export const BriefingSchema = z.object({
	_id: z.string(),
	incidentId: z.string(),
	generatedAt: z.coerce.date(),
	generatedByModel: z.string(),
	summary: z.string(),
	recommendedVehicleIds: z.array(z.string()),
	recommendedResponderIds: z.array(z.string()),
	briefingHash: z.string(),
});
export type Briefing = z.infer<typeof BriefingSchema>;

export function computeBriefingHash(
	payload: Pick<
		Briefing,
		"summary" | "recommendedVehicleIds" | "recommendedResponderIds"
	>,
): string {
	const canonical = canonicalizeBriefingPayload({
		summary: payload.summary,
		recommendedVehicleIds: payload.recommendedVehicleIds,
		recommendedResponderIds: payload.recommendedResponderIds,
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
	const parts = Object.entries(value)
		.sort(([a], [b]) => (a < b ? -1 : 1))
		.map(([k, v]) => `${JSON.stringify(k)}:${canonicalizeBriefingPayload(v)}`);
	return `{${parts.join(",")}}`;
}
