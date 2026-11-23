import type { IncidentUrgency } from "@roam/shared";
import { color } from "./tokens";

export const URGENCY_LABEL: Record<IncidentUrgency, string> = {
	1: "P1 · Lights & sirens",
	2: "P2 · Urgent",
	3: "P3 · Non-urgent",
};

export const URGENCY_HEX: Record<IncidentUrgency, string> = {
	1: color("danger"),
	2: color("warning"),
	3: color("mutedForeground"),
};
