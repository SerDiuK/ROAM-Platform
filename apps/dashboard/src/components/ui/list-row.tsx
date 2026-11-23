"use client";

import { cn } from "@roam/ui";
import type { ComponentProps } from "react";

type ListRowProps = ComponentProps<"button">;

export function ListRow({ className, ...props }: ListRowProps) {
	return (
		<li>
			<button
				type="button"
				className={cn(
					"flex w-full flex-col gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/20 px-2 py-2 text-left transition-colors hover:bg-sidebar-accent/40",
					className,
				)}
				{...props}
			/>
		</li>
	);
}
