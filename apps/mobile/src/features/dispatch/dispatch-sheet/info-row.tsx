import { cn } from "@roam/ui";
import * as React from "react";
import { View } from "react-native";
import { Text } from "@/components/ui/text";

// Compact key/value row used inside the dispatch sheet's body cards.
// Uppercase tracking-wider label, monospace value — matches the dispatch UX.
// (Intentionally distinct from vehicle-details-sheet's DetailRow, which uses
// sentence-case labels and a different visual weight.)
export function InfoRow({
	label,
	value,
	valueClassName,
}: {
	label: string;
	value: string;
	valueClassName?: string;
}): React.JSX.Element {
	return (
		<View className="flex-row items-center justify-between">
			<Text className="text-2xs uppercase tracking-wider text-muted-foreground">
				{label}
			</Text>
			<Text
				className={cn(
					"font-mono text-xs font-sans-medium text-foreground",
					valueClassName,
				)}
			>
				{value}
			</Text>
		</View>
	);
}
