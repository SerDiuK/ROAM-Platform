"use client";

import { cn } from "@roam/ui";

type DividerProps = {
	className?: string;
};

export function Divider({ className }: DividerProps) {
	return (
		<span aria-hidden className={cn("block h-4 w-px bg-border", className)} />
	);
}
