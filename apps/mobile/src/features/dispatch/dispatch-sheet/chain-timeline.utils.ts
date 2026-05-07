import type { IncidentEventKind } from "@roam/shared";

export const EVENT_KIND_LABEL: Record<IncidentEventKind, string> = {
	received: "RECEIVED",
	dispatched: "DISPATCHED",
	accepted: "ACCEPTED",
	rejected: "REJECTED",
	arrived: "ARRIVED",
	cleared: "CLEARED",
};

// Lime for forward-progress events, red for declines, muted for the early
// lifecycle steps. Keys directly into Tailwind colour-class branches in the
// row component.
export type EventKindTone = "lime" | "red" | "muted";

export const EVENT_KIND_TONE: Record<IncidentEventKind, EventKindTone> = {
	received: "muted",
	dispatched: "muted",
	accepted: "lime",
	rejected: "red",
	arrived: "lime",
	cleared: "lime",
};

export function shortSig(sig: string): string {
	if (sig.length <= 9) return sig;
	return `${sig.slice(0, 4)}…${sig.slice(-4)}`;
}
