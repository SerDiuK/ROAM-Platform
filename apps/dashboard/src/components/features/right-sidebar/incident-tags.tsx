import type { IncidentUrgency } from "@roam/shared";
import { cn, URGENCY_LABEL } from "@roam/ui";

const URGENCY_TINT: Record<IncidentUrgency, string> = {
	1: "bg-danger/15 text-danger",
	2: "bg-warning/15 text-warning",
	3: "bg-muted-foreground/15 text-muted-foreground",
};

export function UrgencyTag({ urgency }: { urgency: IncidentUrgency }) {
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

export function CapabilityChip({ label }: { label: string }) {
	return (
		<span className="inline-flex items-center rounded-md border border-sidebar-border bg-sidebar-accent/40 px-2 py-1 text-2xs font-medium uppercase tracking-wider text-muted-foreground">
			{label}
		</span>
	);
}
