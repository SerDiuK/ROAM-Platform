"use client";

import type { IncidentUrgency } from "@roam/shared";
import { cn } from "@roam/ui";

export const URGENCY_TINT: Record<IncidentUrgency, string> = {
	1: "bg-danger/15 text-danger",
	2: "bg-warning/15 text-warning",
	3: "bg-muted-foreground/15 text-muted-foreground",
};

type UrgencyBadgeProps = {
	urgency: IncidentUrgency;
};

export function UrgencyBadge({ urgency }: UrgencyBadgeProps) {
	return (
		<span
			className={cn(
				"inline-flex h-4 w-7 shrink-0 items-center justify-center rounded text-2xs font-bold tracking-wider uppercase",
				URGENCY_TINT[urgency],
			)}
		>
			P{urgency}
		</span>
	);
}
