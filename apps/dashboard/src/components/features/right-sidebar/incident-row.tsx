"use client";

import type { Incident } from "@roam/shared";
import { cn, formatRelative } from "@roam/ui";
import { useCallback } from "react";
import { ListRow } from "../../ui/list-row";
import { StatusDot } from "../../ui/status-pill";
import { formatAssignedCounts, statusToneFor } from "./incident-row.utils";
import { UrgencyBadge } from "./urgency-badge";

type IncidentRowProps = {
	incident: Incident;
	isActive: boolean;
	now: number;
	onSelect: (id: string) => void;
};

export function IncidentRow({
	incident,
	isActive,
	now,
	onSelect,
}: IncidentRowProps) {
	const handleSelect = useCallback(
		() => onSelect(incident._id),
		[onSelect, incident._id],
	);

	const isCancelled = incident.status === "cancelled";

	const incidentType = incident.classification?.incidentType ?? "Unclassified";
	const locationDescription = incident.classification?.locationDescription;
	const urgency = incident.classification?.urgency;
	const assignedSummary = formatAssignedCounts(incident);

	return (
		<ListRow
			aria-pressed={isActive}
			onClick={handleSelect}
			className={cn(
				"cursor-pointer gap-1.5 outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
				isCancelled && "opacity-60",
				isActive &&
					"border-sidebar-ring bg-sidebar-accent/60 hover:bg-sidebar-accent/60",
			)}
		>
			<div className="flex items-center gap-2">
				<StatusDot
					tone={statusToneFor(incident.status)}
					pulse={incident.status === "live"}
				/>
				{urgency !== undefined && <UrgencyBadge urgency={urgency} />}
				<span
					className={cn(
						"min-w-0 flex-1 truncate text-xs font-medium",
						isCancelled ? "text-muted-foreground" : "text-foreground",
					)}
				>
					{incidentType}
				</span>
				<span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
					{formatRelative(incident.callStartedAt, now)}
				</span>
			</div>

			{locationDescription && (
				<div className="truncate pl-4 text-2xs text-muted-foreground">
					{locationDescription}
				</div>
			)}

			<div className="flex items-center justify-between pl-4 text-2xs text-muted-foreground/70">
				<span>{assignedSummary}</span>
				<span className="uppercase tracking-wider">{incident.status}</span>
			</div>
		</ListRow>
	);
}
