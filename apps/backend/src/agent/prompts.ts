import type { IncidentClassification } from "@roam/shared";

export function buildSystemPrompt(): string {
	return [
		"You draft emergency dispatch briefings for a dispatcher to review. You only recommend; the dispatcher confirms.",
		"",
		"Workflow (latency-sensitive — parallelize wherever possible):",
		"1. The user message includes a pre-computed <classification> block (incidentType, urgency, location, requiredCapabilities). Use it directly — do NOT call classify_incident unless the classification is missing or obviously wrong for the transcript.",
		"2. In ONE turn, emit two parallel tool_use blocks: find_nearest_vehicles (using classification.location.lat/lon + requiredCapabilities, ambulance-only fleet so capabilities collapse to ['medic']) AND get_active_incidents (so you can avoid double-dispatching). They have no dependency on each other — issuing them sequentially is wasted latency.",
		"3. get_responder_status — once find_nearest_vehicles returns, verify the responders attached to those vehicles are available and have walletAddress=true (required for USDC payouts).",
		"4. draft_briefing — call this exactly once with the full payload. Do not call it twice; the dispatcher only reviews one draft.",
		"",
		"If location coordinates are missing in the classification but a Miami intersection is named, estimate lat/lon from your knowledge of the city.",
		"",
		"Payout breakdown guidance: base 50 USDC. Multiply by urgency (1 → 2.0, 2 → 1.5, 3 → 1.0), hazmat exposure (1.5 if hazmat-flagged in the transcript, otherwise 1.0), and a distance factor (1.0 + km/10, capped at 2.0). Set totalUsdc = baseUsdc * urgencyMultiplier * hazmatMultiplier * distanceMultiplier, rounded to 2 decimals.",
		"",
		"Recommend at least one vehicle and at least one responder. If no clean dispatch is available, still emit draft_briefing with a summary explaining the constraint and the best fallback choice.",
	].join("\n");
}

// The <transcript> tags make the model treat the caller's words as data, not instructions.
export function buildIncidentBriefingPrompt(args: {
	transcript: string;
	classification?: IncidentClassification;
}): string {
	const lines = [
		"Produce a complete dispatch briefing for the following 911 call.",
		"",
		"<transcript>",
		args.transcript,
		"</transcript>",
	];

	if (args.classification) {
		lines.push(
			"",
			"<classification>",
			JSON.stringify(args.classification, null, 2),
			"</classification>",
			"",
			"The classification has already been computed. Your next turn should emit BOTH find_nearest_vehicles and get_active_incidents as parallel tool_use blocks. Then get_responder_status, then draft_briefing.",
		);
	} else {
		lines.push(
			"",
			"No pre-computed classification is available. Begin with classify_incident, then continue with find_nearest_vehicles, get_responder_status, get_active_incidents, and draft_briefing.",
		);
	}

	return lines.join("\n");
}
