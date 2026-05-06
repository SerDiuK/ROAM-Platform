"use client";

import { Slot } from "@radix-ui/react-slot";
import { cn } from "@roam/ui";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

const buttonVariants = cva(
	"inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-sm border text-xs font-medium uppercase tracking-widest outline-none transition-all focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&_[data-icon]]:pointer-events-none [&_[data-icon]]:shrink-0",
	{
		variants: {
			variant: {
				primary:
					"border-primary bg-primary font-bold text-primary-foreground shadow-xs hover:bg-primary/90",
				secondary:
					"border-secondary bg-secondary font-semibold text-secondary-foreground shadow-xs hover:bg-secondary/80",
				outline:
					"border-border2 bg-transparent font-semibold text-muted-foreground shadow-xs hover:border-foreground hover:text-foreground",
				ghost:
					"border-transparent bg-transparent font-semibold text-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
				destructive:
					"border-destructive bg-destructive font-bold text-destructive-foreground shadow-xs hover:bg-destructive/90",
				link: "border-transparent bg-transparent text-primary normal-case tracking-normal underline-offset-4 hover:underline",
			},
			size: {
				default: "h-9 px-4 py-2 has-[>[data-icon]]:px-3",
				sm: "h-8 gap-1.5 px-3 has-[>[data-icon]]:px-2.5",
				lg: "text-sm h-10 px-6 has-[>[data-icon]]:px-4",
				icon: "size-9",
			},
		},
		defaultVariants: {
			variant: "primary",
			size: "default",
		},
	},
);

type ButtonProps = ComponentProps<"button"> &
	VariantProps<typeof buttonVariants> & {
		asChild?: boolean;
	};

export function Button({
	className,
	variant,
	size,
	asChild = false,
	type,
	...props
}: ButtonProps) {
	const Comp = asChild ? Slot : "button";
	return (
		<Comp
			data-slot="button"
			className={cn(buttonVariants({ variant, size }), className)}
			{...(asChild ? {} : { type: type ?? "button" })}
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
				"inline-flex size-9 items-center justify-center rounded-sm text-foreground/70 outline-none transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] [&_[data-icon]]:pointer-events-none [&_[data-icon]]:shrink-0",
				className,
			)}
			{...props}
		/>
	);
}

export type { ButtonProps };
export { buttonVariants };
