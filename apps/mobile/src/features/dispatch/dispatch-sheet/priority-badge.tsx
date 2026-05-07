import { cn, URGENCY_LABEL } from "@roam/ui";
import * as React from "react";
import { View } from "react-native";
import { Text } from "@/components/ui/text";

export function PriorityBadge({
	urgency,
}: {
	urgency: 1 | 2 | 3;
}): React.JSX.Element {
	const tone =
		urgency === 1
			? "bg-danger/20 text-danger"
			: urgency === 2
				? "bg-warning/20 text-warning"
				: "bg-muted text-muted-foreground";
	return (
		<View className={cn("rounded-sm px-1.5 py-0.5", tone)}>
			<Text className={cn("text-2xs font-sans-bold uppercase tracking-wider")}>
				{URGENCY_LABEL[urgency]}
			</Text>
		</View>
	);
}
