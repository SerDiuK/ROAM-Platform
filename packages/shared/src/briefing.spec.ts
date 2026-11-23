import { describe, expect, it } from "vitest";
import { computeBriefingHash } from "./briefing";

const PAYLOAD = {
	summary:
		"Multi-vehicle crash at Biscayne Blvd & NE 36th. Two ambulances dispatched.",
	recommendedVehicleIds: ["vehicle-1", "vehicle-2"],
	recommendedResponderIds: ["responder-1", "responder-2"],
};

describe("computeBriefingHash", () => {
	it("changes when any user-visible field changes", () => {
		const baseline = computeBriefingHash(PAYLOAD);
		expect(computeBriefingHash({ ...PAYLOAD, summary: "different" })).not.toBe(
			baseline,
		);
		expect(
			computeBriefingHash({
				...PAYLOAD,
				recommendedVehicleIds: ["vehicle-2", "vehicle-1"],
			}),
		).not.toBe(baseline);
		expect(
			computeBriefingHash({
				...PAYLOAD,
				recommendedResponderIds: ["responder-1"],
			}),
		).not.toBe(baseline);
	});
});
