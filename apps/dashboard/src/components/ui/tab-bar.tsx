"use client";

import { cn } from "@roam/ui";
import { cva } from "class-variance-authority";
import type { ComponentProps } from "react";

export function TabBar({ className, ...props }: ComponentProps<"div">) {
	return (
		<div
			className={cn("flex border-b border-sidebar-border", className)}
			{...props}
		/>
	);
}

export const tabButtonVariants = cva(
	"flex flex-1 items-center justify-center border-b-2 px-2 py-2 text-xs font-semibold uppercase tracking-widest transition-colors",
	{
		variants: {
			active: {
				true: "border-primary text-primary",
				false:
					"border-transparent text-muted-foreground hover:bg-sidebar-accent/30 hover:text-foreground",
			},
		},
	},
);

type TabButtonProps = {
	active: boolean;
	onClick: () => void;
	label: string;
};

export function TabButton({ active, onClick, label }: TabButtonProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={tabButtonVariants({ active })}
		>
			{label}
		</button>
	);
}
