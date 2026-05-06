"use client";

import { cn } from "@roam/ui";
import type { ReactNode } from "react";

type UnitCardTone = "primary" | "warning" | "danger" | "offline" | "muted";

type UnitCardProps = {
	callsign: ReactNode;
	meta?: ReactNode;
	trailingValue?: ReactNode;
	trailingLabel?: ReactNode;
	tone?: UnitCardTone;
	trailingTone?: UnitCardTone;
	isActive?: boolean;
	onClick?: () => void;
	className?: string;
};

const dotClasses: Record<UnitCardTone, string> = {
	primary: "bg-primary",
	warning: "bg-warning",
	danger: "bg-danger",
	offline: "bg-offline",
	muted: "bg-muted-foreground",
};

const valueClasses: Record<UnitCardTone, string> = {
	primary: "text-primary",
	warning: "text-warning",
	danger: "text-danger",
	offline: "text-muted-foreground",
	muted: "text-muted-foreground",
};

export function UnitCard({
	callsign,
	meta,
	trailingValue,
	trailingLabel,
	tone = "muted",
	trailingTone,
	isActive,
	onClick,
	className,
}: UnitCardProps) {
	const baseClasses = cn(
		"flex w-full items-center gap-2.5 rounded-md border border-sidebar-border bg-sidebar-accent/30 p-2.5 text-left transition-colors",
		isActive && "border-sidebar-ring bg-sidebar-accent/60",
		onClick &&
			"cursor-pointer hover:bg-sidebar-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
		className,
	);

	const valueColor = valueClasses[trailingTone ?? tone];
	const hasTrailing =
		trailingValue !== undefined || trailingLabel !== undefined;

	const content = (
		<>
			<span className={cn("size-2 shrink-0 rounded-full", dotClasses[tone])} />
			<div className="min-w-0 flex-1">
				<div className="truncate font-mono text-xs font-bold text-foreground">
					{callsign}
				</div>
				{meta !== undefined && (
					<div className="truncate text-2xs text-muted-foreground">{meta}</div>
				)}
			</div>
			{hasTrailing && (
				<div className="shrink-0 text-right">
					{trailingValue !== undefined && (
						<div
							className={cn(
								"font-mono text-sm font-bold tabular-nums",
								valueColor,
							)}
						>
							{trailingValue}
						</div>
					)}
					{trailingLabel !== undefined && (
						<div className="text-2xs uppercase tracking-wider text-muted-foreground/70">
							{trailingLabel}
						</div>
					)}
				</div>
			)}
		</>
	);

	if (onClick) {
		return (
			<button
				type="button"
				data-active={isActive}
				onClick={onClick}
				className={baseClasses}
			>
				{content}
			</button>
		);
	}
	return (
		<div data-active={isActive} className={baseClasses}>
			{content}
		</div>
	);
}

export type { UnitCardProps, UnitCardTone };
