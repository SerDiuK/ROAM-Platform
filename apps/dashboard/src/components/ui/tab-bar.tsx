"use client";

import { cn } from "@roam/ui";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";

export function TabBar({ className, ...props }: ComponentProps<"div">) {
	return (
		<div
			className={cn("flex border-b border-sidebar-border", className)}
			{...props}
		/>
	);
}

const tabButtonVariants = cva(
	"flex flex-1 items-center justify-center gap-2 border-b-2 px-2 py-2 text-xs font-semibold uppercase tracking-widest transition-colors",
	{
		variants: {
			tone: {
				primary: "",
				accent: "",
			},
			active: {
				true: "",
				false:
					"border-transparent text-muted-foreground hover:bg-sidebar-accent/30 hover:text-foreground",
			},
		},
		compoundVariants: [
			{ tone: "primary", active: true, class: "border-primary text-primary" },
			{ tone: "accent", active: true, class: "border-solana text-solana" },
		],
		defaultVariants: {
			tone: "primary",
			active: false,
		},
	},
);

type TabTone = NonNullable<VariantProps<typeof tabButtonVariants>["tone"]>;

type TabButtonProps = {
	active: boolean;
	onClick: () => void;
	icon?: ReactNode;
	label: string;
	tone?: TabTone;
};

export function TabButton({
	active,
	onClick,
	icon,
	label,
	tone = "primary",
}: TabButtonProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={tabButtonVariants({ tone, active })}
		>
			{icon}
			{label}
		</button>
	);
}
