import { describe, expect, it } from "vitest";
import { classifyIncidentTool } from "./classifyIncident.js";
import type { AgentToolContext } from "./types.js";

const ctx = { log: {} as AgentToolContext["log"] } satisfies AgentToolContext;

async function classify(transcript: string) {
	return classifyIncidentTool.handler({ transcript }, ctx);
}

describe("classifyIncidentTool", () => {
	it("routes fire keywords to a Structure fire at urgency 1 with medic capability", async () => {
		const result = await classify(
			"Fire on the second floor, smoke everywhere, my neighbor is still inside.",
		);
		expect(result.incidentType).toBe("Structure fire");
		expect(result.urgency).toBe(1);
		expect(result.requiredCapabilities).toEqual(["medic"]);
	});

	it("routes hazmat keywords to a Hazmat incident at urgency 1 with medic capability", async () => {
		const result = await classify(
			"There's a chemical spill at the loading dock, fumes are spreading.",
		);
		expect(result.incidentType).toBe("Hazmat incident");
		expect(result.urgency).toBe(1);
		expect(result.requiredCapabilities).toEqual(["medic"]);
	});

	it("routes medical keywords (cardiac) to a Medical emergency at urgency 1", async () => {
		const result = await classify(
			"My husband is having chest pain, he can't breathe properly.",
		);
		expect(result.incidentType).toBe("Medical emergency");
		expect(result.urgency).toBe(1);
		expect(result.requiredCapabilities).toEqual(["medic"]);
	});

	it("routes a softer medical signal to Medical assist at urgency 2", async () => {
		const result = await classify(
			"Someone is injured at the park, please send an ambulance.",
		);
		expect(result.incidentType).toBe("Medical assist");
		expect(result.urgency).toBe(2);
		expect(result.requiredCapabilities).toEqual(["medic"]);
	});

	it("extracts an intersection from 'at <street> and <street>' phrasing", async () => {
		const result = await classify(
			"Hazmat spill at Flagler and 2nd Ave, please hurry.",
		);
		expect(result.locationDescription).toBe("Flagler and 2nd Ave");
		expect(result.location).toBeUndefined();
	});

	it("geocodes Biscayne & 36th to canonical text + lat/lon", async () => {
		const result = await classify(
			"There's been a bad crash at Biscayne and 36th, two cars.",
		);
		expect(result.locationDescription).toBe(
			"Biscayne Blvd & NE 36th St, Miami",
		);
		expect(result.location).toEqual({ lat: 25.81189, lon: -80.18889 });
	});

	it("matches the demo intersection through Deepgram's '30 6' transcription quirk", async () => {
		const result = await classify(
			"Crash at Biscayne And 30 6. Two cars. Someone's not moving.",
		);
		expect(result.location).toEqual({ lat: 25.81189, lon: -80.18889 });
	});

	it("classifies + extracts location in the same pass", async () => {
		const result = await classify(
			"There's been a crash at Brickell and 8th, multiple cars.",
		);
		expect(result.incidentType).toBe("Vehicle collision");
		expect(result.locationDescription).toBe("Brickell and 8th");
	});

	it("falls back to Unclassified urgency 2 with no capabilities when nothing matches", async () => {
		const result = await classify("Hello, can you hear me? Yes. Thanks, bye.");
		expect(result.incidentType).toBe("Unclassified");
		expect(result.urgency).toBe(2);
		expect(result.requiredCapabilities).toEqual([]);
		expect(result.locationDescription).toBeUndefined();
	});
});
