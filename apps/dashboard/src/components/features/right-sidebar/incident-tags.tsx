"use client";

import type { IncidentUrgency } from "@roam/shared";
import { cn, URGENCY_LABEL } from "@roam/ui";
import { URGENCY_TINT } from "./urgency-badge";

type UrgencyTagProps = {
	urgency: IncidentUrgency;
};

export function UrgencyTag({ urgency }: UrgencyTagProps) {
	return (
		<span
			className={cn(
				"inline-flex items-center rounded px-2 py-0.5 text-2xs font-bold uppercase tracking-wider",
				URGENCY_TINT[urgency],
			)}
		>
			{URGENCY_LABEL[urgency]}
		</span>
	);
}

type CapabilityChipProps = {
	label: string;
};

export function CapabilityChip({ label }: CapabilityChipProps) {
	return (
		<span className="inline-flex items-center rounded-md border border-sidebar-border bg-sidebar-accent/40 px-2 py-1 text-2xs font-medium uppercase tracking-wider text-muted-foreground">
			{label}
		</span>
	);
}
