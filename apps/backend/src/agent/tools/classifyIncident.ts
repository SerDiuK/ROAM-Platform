import {
	type Coord,
	type IncidentClassification,
	IncidentClassificationSchema,
	type IncidentUrgency,
	type ResponderCapability,
} from "@roam/shared";
import { z } from "zod";
import type { AgentTool } from "./types.js";

const InputSchema = z.object({
	transcript: z.string().min(1),
});
type Input = z.infer<typeof InputSchema>;

interface Rule {
	pattern: RegExp;
	incidentType: string;
	urgency: IncidentUrgency;
	requiredCapabilities: ResponderCapability[];
}

// First match wins, so order is priority.
const RULES: Rule[] = [
	{
		pattern: /\b(hazmat|chemical|spill|gas leak|toxic|fumes)\b/i,
		incidentType: "Hazmat incident",
		urgency: 1,
		requiredCapabilities: ["medic"],
	},
	{
		pattern: /\b(fire|smoke|burning|flames|arson)\b/i,
		incidentType: "Structure fire",
		urgency: 1,
		requiredCapabilities: ["medic"],
	},
	{
		pattern:
			/\b(cardiac|chest pain|stroke|unconscious|not breathing|bleeding|overdose|seizure)\b/i,
		incidentType: "Medical emergency",
		urgency: 1,
		requiredCapabilities: ["medic"],
	},
	{
		pattern: /\b(crash|collision|accident|t-boned|rear[- ]ended)\b/i,
		incidentType: "Vehicle collision",
		urgency: 2,
		requiredCapabilities: ["medic"],
	},
	{
		pattern: /\b(medical|ambulance|injured|hurt|wound)\b/i,
		incidentType: "Medical assist",
		urgency: 2,
		requiredCapabilities: ["medic"],
	},
	{
		pattern: /\b(armed|gun|shooter|hostage|robbery|assault)\b/i,
		incidentType: "Armed incident",
		urgency: 1,
		requiredCapabilities: ["medic"],
	},
	{
		pattern: /\b(missing|lost child|search)\b/i,
		incidentType: "Search",
		urgency: 2,
		requiredCapabilities: [],
	},
];

const INTERSECTION_PATTERN =
	/\bat\s+([A-Za-z0-9.\- ]+?)\s+and\s+([A-Za-z0-9.\- ]+?)(?:[,.;!?]|\s+(?:in|near|please|hurry|now)\b|$)/i;

const KNOWN_INTERSECTIONS: Array<{
	matchers: RegExp[];
	description: string;
	coords: Coord;
}> = [
	{
		matchers: [
			/\bbiscayne\b[^.]*\b(?:36(?:th)?|30\s*6)\b/i,
			/\b(?:36(?:th)?|30\s*6)\b[^.]*\bbiscayne\b/i,
		],
		description: "Biscayne Blvd & NE 36th St, Miami",
		coords: { lat: 25.81189, lon: -80.18889 },
	},
];

interface ParsedLocation {
	description?: string;
	coords?: Coord;
}

function parseLocation(transcript: string): ParsedLocation {
	for (const known of KNOWN_INTERSECTIONS) {
		if (known.matchers.some((m) => m.test(transcript))) {
			return { description: known.description, coords: known.coords };
		}
	}
	const match = transcript.match(INTERSECTION_PATTERN);
	if (!match) return {};
	const left = match[1].trim();
	const right = match[2].trim();
	if (!left || !right) return {};
	return { description: `${left} and ${right}` };
}

function applyRules(transcript: string): {
	incidentType: string;
	urgency: IncidentUrgency;
	requiredCapabilities: ResponderCapability[];
} {
	for (const rule of RULES) {
		if (rule.pattern.test(transcript)) {
			return {
				incidentType: rule.incidentType,
				urgency: rule.urgency,
				requiredCapabilities: [...rule.requiredCapabilities],
			};
		}
	}
	return {
		incidentType: "Unclassified",
		urgency: 2,
		requiredCapabilities: [],
	};
}

export const classifyIncidentTool: AgentTool<Input, IncidentClassification> = {
	name: "classify_incident",
	description:
		"Classify the current 911 transcript into a structured incident type, urgency (1=life-threatening, 2=urgent, 3=non-urgent), and the responder capabilities needed to respond. Also extracts an intersection location of the form '<street> and <street>' when present in the transcript.",
	inputSchema: InputSchema,
	handler: async (input) => {
		const { incidentType, urgency, requiredCapabilities } = applyRules(
			input.transcript,
		);
		const location = parseLocation(input.transcript);
		const result: IncidentClassification = {
			incidentType,
			urgency,
			requiredCapabilities,
			...(location.description
				? { locationDescription: location.description }
				: {}),
			...(location.coords ? { location: location.coords } : {}),
		};
		return IncidentClassificationSchema.parse(result);
	},
};
