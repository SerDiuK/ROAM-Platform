import { cn } from "@roam/ui";
import type { ComponentProps } from "react";

type ListRowProps = ComponentProps<"li"> & {
	layout?: "row" | "stack";
};

export function ListRow({ className, layout = "row", ...props }: ListRowProps) {
	return (
		<li
			className={cn(
				"rounded-md border border-sidebar-border bg-sidebar-accent/20 px-2 py-2 transition-colors hover:bg-sidebar-accent/40",
				layout === "row" ? "flex items-start gap-2" : "flex flex-col gap-2",
				className,
			)}
			{...props}
		/>
	);
}
