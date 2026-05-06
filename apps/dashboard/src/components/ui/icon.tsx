"use client";

import { cn } from "@roam/ui";
import type { ComponentProps } from "react";

type IconProps = Omit<ComponentProps<"span">, "children"> & {
	name: string;
};

export function Icon({ name, className, ...props }: IconProps) {
	return (
		<span
			data-icon=""
			aria-hidden="true"
			className={cn(
				"material-symbols-outlined inline-block text-base leading-none select-none",
				className,
			)}
			{...props}
		>
			{name}
		</span>
	);
}

export type { IconProps };
