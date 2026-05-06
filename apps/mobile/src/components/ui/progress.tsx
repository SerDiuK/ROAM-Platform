import * as ProgressPrimitive from "@rn-primitives/progress";
import { cn } from "@roam/ui";
import type * as React from "react";
import Animated, {
	type SharedValue,
	useAnimatedStyle,
} from "react-native-reanimated";

const ROOT_BASE =
	"relative h-2 w-full overflow-hidden rounded-full bg-secondary";
const INDICATOR_BASE = "h-full bg-primary";

type ProgressProps = React.ComponentProps<typeof ProgressPrimitive.Root> & {
	indicatorClassName?: string;
};

function Progress({
	className,
	value,
	indicatorClassName,
	...props
}: ProgressProps): React.JSX.Element {
	const pct = Math.max(0, Math.min(100, value ?? 0));
	return (
		<ProgressPrimitive.Root
			className={cn(ROOT_BASE, className)}
			value={value}
			{...props}
		>
			<ProgressPrimitive.Indicator
				className={cn(INDICATOR_BASE, indicatorClassName)}
				style={{ width: `${pct}%` }}
			/>
		</ProgressPrimitive.Root>
	);
}

type AnimatedProgressProps = {
	progress: SharedValue<number>; // 0..1
	className?: string;
	indicatorClassName?: string;
};

function AnimatedProgress({
	progress,
	className,
	indicatorClassName,
}: AnimatedProgressProps): React.JSX.Element {
	const indicatorStyle = useAnimatedStyle(() => ({
		width: `${Math.max(0, Math.min(1, progress.value)) * 100}%`,
	}));

	return (
		<ProgressPrimitive.Root className={cn(ROOT_BASE, className)} value={null}>
			<ProgressPrimitive.Indicator asChild>
				<Animated.View
					style={indicatorStyle}
					className={cn(INDICATOR_BASE, indicatorClassName)}
				/>
			</ProgressPrimitive.Indicator>
		</ProgressPrimitive.Root>
	);
}

export { AnimatedProgress, Progress };
