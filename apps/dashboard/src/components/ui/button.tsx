"use client";

import { cn } from "@roam/ui";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

const buttonVariants = cva(
	"inline-flex h-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-sm border px-3 text-xs font-medium uppercase tracking-widest outline-none transition-all focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 has-[>[data-icon]]:px-2.5 [&_[data-icon]]:pointer-events-none [&_[data-icon]]:shrink-0",
	{
		variants: {
			variant: {
				ghost:
					"border-transparent bg-transparent font-semibold text-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
				destructive:
					"border-destructive bg-destructive font-bold text-destructive-foreground shadow-xs hover:bg-destructive/90",
			},
		},
	},
);

type ButtonProps = ComponentProps<"button"> & {
	variant: NonNullable<VariantProps<typeof buttonVariants>["variant"]>;
};

export function Button({ className, variant, type, ...props }: ButtonProps) {
	return (
		<button
			data-slot="button"
			type={type ?? "button"}
			className={cn(buttonVariants({ variant }), className)}
			{...props}
		/>
	);
}

export function IconButton({
	className,
	type,
	...props
}: ComponentProps<"button">) {
	return (
		<button
			data-slot="icon-button"
			type={type ?? "button"}
			className={cn(
				"inline-flex size-9 items-center justify-center rounded-sm text-foreground/70 outline-none transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3 [&_[data-icon]]:pointer-events-none [&_[data-icon]]:shrink-0",
				className,
			)}
			{...props}
		/>
	);
}
