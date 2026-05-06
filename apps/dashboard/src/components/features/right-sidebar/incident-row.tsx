"use client";

import type { Incident } from "@roam/shared";
import { cn, formatRelative } from "@roam/ui";
import type { KeyboardEvent } from "react";
import { ListRow } from "../../ui/list-row";
import { StatusDot } from "../../ui/status-pill";
import { formatAssignedCounts, statusToneFor } from "./incident-row.utils";
import { UrgencyBadge } from "./urgency-badge";

type IncidentRowProps = {
	incident: Incident;
	isActive?: boolean;
	onSelect: () => void;
};

export function IncidentRow({
	incident,
	isActive,
	onSelect,
}: IncidentRowProps) {
	const isResolved = incident.status === "resolved";
	const isCancelled = incident.status === "cancelled";

	const incidentType = incident.classification?.incidentType ?? "Unclassified";
	const locationDescription = incident.classification?.locationDescription;
	const urgency = incident.classification?.urgency;
	const assignedSummary = formatAssignedCounts(incident);

	const handleKeyDown = (event: KeyboardEvent<HTMLLIElement>): void => {
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			onSelect();
		}
	};

	return (
		<ListRow
			layout="stack"
			role="button"
			tabIndex={0}
			aria-pressed={isActive}
			onClick={onSelect}
			onKeyDown={handleKeyDown}
			className={cn(
				"cursor-pointer gap-1.5 outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
				isResolved &&
					"border-primary/40 bg-primary text-primary-foreground hover:bg-primary/90",
				isCancelled && "opacity-60",
				isActive &&
					!isResolved &&
					"border-sidebar-ring bg-sidebar-accent/60 hover:bg-sidebar-accent/60",
			)}
		>
			<div className="flex items-center gap-2">
				{!isResolved && (
					<StatusDot
						tone={statusToneFor(incident.status)}
						pulse={incident.status === "live"}
					/>
				)}
				{urgency !== undefined && (
					<UrgencyBadge urgency={urgency} inverted={isResolved} />
				)}
				<span
					className={cn(
						"min-w-0 flex-1 truncate text-xs font-medium",
						isResolved
							? "text-primary-foreground"
							: isCancelled
								? "text-muted-foreground"
								: "text-foreground",
					)}
				>
					{incidentType}
				</span>
				<span
					className={cn(
						"shrink-0 text-2xs tabular-nums",
						isResolved ? "text-primary-foreground/70" : "text-muted-foreground",
					)}
				>
					{formatRelative(incident.callStartedAt)}
				</span>
			</div>

			{locationDescription && (
				<div
					className={cn(
						"truncate pl-4 text-2xs",
						isResolved ? "text-primary-foreground/80" : "text-muted-foreground",
					)}
				>
					{locationDescription}
				</div>
			)}

			<div
				className={cn(
					"flex items-center justify-between pl-4 text-2xs",
					isResolved
						? "text-primary-foreground/80"
						: "text-muted-foreground/70",
				)}
			>
				<span>{assignedSummary}</span>
				<span className="uppercase tracking-wider">{incident.status}</span>
			</div>
		</ListRow>
	);
}
