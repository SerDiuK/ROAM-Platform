import * as React from "react";
import { View } from "react-native";
import {
	cancelAnimation,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import { AnimatedProgress } from "@/components/ui/progress";
import { Text } from "@/components/ui/text";

// Counts down from now → expiresAt. The track fill animates the remaining
// fraction; the seconds label is a 1Hz `useState` tick (cheap, and only this
// component re-renders). Calls `onExpire` exactly once when the deadline passes
// so the parent can dismiss the sheet.
export function ResponseTimer({
	expiresAt,
	onExpire,
}: {
	expiresAt: Date | string;
	onExpire: () => void;
}): React.JSX.Element {
	const expiresMs = React.useMemo(
		() =>
			typeof expiresAt === "string"
				? new Date(expiresAt).getTime()
				: expiresAt.getTime(),
		[expiresAt],
	);

	const totalMs = React.useMemo(
		() => Math.max(1000, expiresMs - Date.now()),
		[expiresMs],
	);

	const progress = useSharedValue(1);
	const expiredRef = React.useRef(false);
	const [remainingSecs, setRemainingSecs] = React.useState(() =>
		Math.max(0, Math.ceil((expiresMs - Date.now()) / 1000)),
	);

	React.useEffect(() => {
		expiredRef.current = false;
		progress.value = 1;
		const remainingMs = Math.max(0, expiresMs - Date.now());
		progress.value = withTiming(0, { duration: remainingMs });

		const tick = (): void => {
			const left = Math.max(0, Math.ceil((expiresMs - Date.now()) / 1000));
			setRemainingSecs(left);
			if (left <= 0 && !expiredRef.current) {
				expiredRef.current = true;
				onExpire();
			}
		};
		tick();
		const interval = setInterval(tick, 250);
		return () => {
			clearInterval(interval);
			cancelAnimation(progress);
		};
	}, [expiresMs, progress, onExpire]);

	const fillClass =
		remainingSecs > totalMs / 1000 / 2
			? "bg-primary"
			: remainingSecs > totalMs / 1000 / 4
				? "bg-warning"
				: "bg-danger";

	return (
		<View className="gap-1.5">
			<View className="flex-row items-center justify-between">
				<Text className="text-2xs uppercase tracking-wider text-muted-foreground">
					Respond within
				</Text>
				<Text className="font-mono text-xs font-sans-semibold text-foreground tabular-nums">
					{remainingSecs}s
				</Text>
			</View>
			<AnimatedProgress
				progress={progress}
				className="h-1.5 rounded-full bg-muted"
				indicatorClassName={fillClass}
			/>
		</View>
	);
}
