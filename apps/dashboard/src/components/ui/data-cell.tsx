"use client";

import { cn } from "@roam/ui";
import type { ReactNode } from "react";

type DataCellProps = {
	label: string;
	value: ReactNode;
	leading?: ReactNode;
	emphasis?: "value" | "metric";
};

export function DataCell({
	label,
	value,
	leading,
	emphasis = "value",
}: DataCellProps) {
	return (
		<div className="flex flex-col gap-1 rounded-md border border-sidebar-border bg-sidebar-accent/30 p-2">
			<div className="flex items-center gap-2">
				{leading}
				<span className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
					{label}
				</span>
			</div>
			<span
				className={cn(
					"tabular-nums text-foreground",
					emphasis === "metric"
						? "text-lg font-semibold"
						: "text-sm font-semibold",
				)}
			>
				{value}
			</span>
		</div>
	);
}
