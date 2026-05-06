import { cn } from "@roam/ui";
import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";

const statusDotVariants = cva("inline-block shrink-0 rounded-full ring-2", {
	variants: {
		tone: {
			primary: "bg-primary ring-primary/30",
			warning: "bg-warning ring-warning/30",
			danger: "bg-danger ring-danger/30",
			offline: "bg-offline ring-offline/30",
			muted: "bg-muted-foreground ring-muted-foreground/30",
		},
		size: {
			xs: "size-1.5",
			sm: "size-2",
			md: "size-2.5",
		},
		pulse: {
			true: "animate-pulse",
		},
	},
	defaultVariants: {
		size: "sm",
	},
});

type Tone = NonNullable<VariantProps<typeof statusDotVariants>["tone"]>;

type StatusDotProps = {
	tone: Tone;
	size?: "xs" | "sm" | "md";
	pulse?: boolean;
	className?: string;
};

export function StatusDot({ tone, size, pulse, className }: StatusDotProps) {
	return (
		<span className={cn(statusDotVariants({ tone, size, pulse }), className)} />
	);
}

export function StatusPill({
	tone,
	children,
	className,
}: {
	tone: Tone;
	children: ReactNode;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/40 px-2 py-1 text-xs font-medium text-sidebar-foreground/80 uppercase tracking-wider",
				className,
			)}
		>
			<StatusDot tone={tone} size="xs" />
			{children}
		</span>
	);
}
