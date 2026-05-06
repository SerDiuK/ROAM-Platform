import { cn } from "@roam/ui";

type DividerProps = {
	orientation?: "vertical" | "horizontal";
	className?: string;
};

export function Divider({ orientation = "vertical", className }: DividerProps) {
	return (
		<span
			aria-hidden
			className={cn(
				"block bg-border",
				orientation === "vertical" ? "h-4 w-px" : "h-px w-full",
				className,
			)}
		/>
	);
}
