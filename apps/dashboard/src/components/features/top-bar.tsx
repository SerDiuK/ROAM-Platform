"use client";

import { Button, IconButton } from "../ui/button";
import { Divider } from "../ui/divider";
import { Icon } from "../ui/icon";
import { StatusDot } from "../ui/status-pill";

type TopBarProps = {
	leftOpen: boolean;
	rightOpen: boolean;
	onToggleLeft: () => void;
	onToggleRight: () => void;
	telemetryConnected: boolean;
	transmittingCount: number;
	totalCount: number;
	onReportsClick?: () => void;
	onMissionBriefClick?: () => void;
};

export function TopBar({
	leftOpen,
	rightOpen,
	onToggleLeft,
	onToggleRight,
	telemetryConnected,
	transmittingCount,
	totalCount,
	onReportsClick,
	onMissionBriefClick,
}: TopBarProps) {
	return (
		<header className="relative z-30 flex h-12 shrink-0 items-center gap-3 border-b border-border bg-background/95 px-3 backdrop-blur">
			{!leftOpen && (
				<IconButton onClick={onToggleLeft} aria-label="Show fleet status">
					<Icon name="left_panel_open" />
				</IconButton>
			)}

			<div className="flex items-center gap-2 pr-1">
				<span className="font-bold tracking-widest text-primary leading-1">
					ROAM
				</span>
				<span className="hidden uppercase text-sm tracking-widest text-muted-foreground leading-1 sm:inline">
					Command Dashboard
				</span>
				<span className="hidden uppercase text-sm tracking-widest text-secondary-text leading-1 sm:inline">
					Miami
				</span>
			</div>

			<div className="ml-auto flex items-center gap-3 text-xs">
				<div className="hidden items-center gap-2 text-muted-foreground md:flex">
					<StatusDot tone={telemetryConnected ? "primary" : "danger"} />
					<span>
						<span className="text-foreground">{transmittingCount}</span>
						<span className="text-muted-foreground">/{totalCount}</span>{" "}
						transmitting
					</span>
				</div>
				<Divider className="hidden md:block" />
				<div className="flex items-center gap-2 text-muted-foreground">
					<span className="size-1.5 rounded-full bg-warning" />
					<span className="font-medium uppercase tracking-wider text-foreground/80">
						Miami
					</span>
				</div>

				<Divider />

				<Button variant="outline" size="sm" onClick={onReportsClick}>
					<Icon name="summarize" />
					Reports
				</Button>
				<Button variant="primary" size="sm" onClick={onMissionBriefClick}>
					<Icon name="bolt" />
					Mission Brief
				</Button>
			</div>

			{!rightOpen && (
				<IconButton onClick={onToggleRight} aria-label="Show activity feed">
					<Icon name="right_panel_open" />
				</IconButton>
			)}
		</header>
	);
}
