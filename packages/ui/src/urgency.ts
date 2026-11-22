import type { IncidentUrgency } from "@roam/shared";
import type { StatusTone } from "./status";

export const URGENCY_TONE: Record<IncidentUrgency, StatusTone | "muted"> = {
	1: "danger",
	2: "warning",
	3: "muted",
};

export const URGENCY_LABEL: Record<IncidentUrgency, string> = {
	1: "P1 · Lights & sirens",
	2: "P2 · Urgent",
	3: "P3 · Non-urgent",
};

export const URGENCY_HEX: Record<IncidentUrgency, string> = {
	1: "#ef4444",
	2: "#f59e0b",
	3: "#6b7280",
};
