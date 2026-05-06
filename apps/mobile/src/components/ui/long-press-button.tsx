import { cn } from "@roam/ui";
import * as React from "react";
import { Pressable, View } from "react-native";
import {
	cancelAnimation,
	runOnJS,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import { AnimatedProgress } from "@/components/ui/progress";
import { Text } from "@/components/ui/text";

const HOLD_DURATION_MS = 3000;

type Variant = "default" | "destructive";

type Props = {
	label: string;
	activeLabel?: string;
	onConfirm: () => void;
	disabled?: boolean;
	variant?: Variant;
};

const trackClass: Record<Variant, string> = {
	default: "border-primary",
	destructive: "border-destructive",
};

const fillClass: Record<Variant, string> = {
	default: "bg-primary",
	destructive: "bg-destructive",
};

const idleTextClass: Record<Variant, string> = {
	default: "text-primary",
	destructive: "text-destructive",
};

const activeTextClass: Record<Variant, string> = {
	default: "text-primary-foreground",
	destructive: "text-white",
};

function LongPressButton({
	label,
	activeLabel,
	onConfirm,
	disabled,
	variant = "default",
}: Props): React.JSX.Element {
	const progress = useSharedValue(0);
	const [holding, setHolding] = React.useState(false);

	const handleConfirm = React.useCallback((): void => {
		setHolding(false);
		progress.value = 0;
		onConfirm();
	}, [onConfirm, progress]);

	const handlePressIn = (): void => {
		if (disabled) return;
		setHolding(true);
		progress.value = withTiming(
			1,
			{ duration: HOLD_DURATION_MS },
			(finished) => {
				if (finished) {
					runOnJS(handleConfirm)();
				}
			},
		);
	};

	const handlePressOut = (): void => {
		cancelAnimation(progress);
		progress.value = withTiming(0, { duration: 180 });
		setHolding(false);
	};

	return (
		<Pressable
			onPressIn={handlePressIn}
			onPressOut={handlePressOut}
			disabled={disabled}
			className={cn(
				"relative h-12 items-center justify-center overflow-hidden rounded-md border-2",
				trackClass[variant],
				disabled && "opacity-50",
			)}
		>
			<AnimatedProgress
				progress={progress}
				className="absolute inset-0 h-full rounded-none bg-transparent"
				indicatorClassName={fillClass[variant]}
			/>
			<View className="z-10 flex-row items-center justify-center px-4">
				<Text
					className={cn(
						"text-sm font-semibold",
						holding ? activeTextClass[variant] : idleTextClass[variant],
					)}
				>
					{holding && activeLabel ? activeLabel : label}
				</Text>
			</View>
		</Pressable>
	);
}

export { LongPressButton };
