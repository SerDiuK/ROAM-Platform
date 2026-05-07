import * as React from "react";
import { Pressable, View } from "react-native";
import { SheetTitle } from "@/components/ui/sheet";
import { Text } from "@/components/ui/text";
import type { DispatchInboxData } from "../use-dispatch-inbox";

// Terminal state when another responder claimed the dispatch first or the
// race lost the atomic claim. Surface a single dismiss action — there's
// nothing for the responder to do here.
export function ConflictBody({
	data,
	message,
	onDismiss,
}: {
	data: DispatchInboxData;
	message: string;
	onDismiss: () => void;
}): React.JSX.Element {
	const human =
		message === "dispatch_already_claimed"
			? "Another responder claimed this dispatch first."
			: message;
	return (
		<View className="gap-3 pb-2">
			<SheetTitle>Already claimed</SheetTitle>
			<Text className="text-sm text-muted-foreground">{human}</Text>
			<Text className="text-2xs text-muted-foreground">
				INC-{data.incident._id.slice(0, 8).toUpperCase()}
			</Text>
			<Pressable
				onPress={onDismiss}
				className="mt-2 h-12 items-center justify-center rounded-md bg-primary"
				accessibilityLabel="Close"
			>
				<Text className="text-sm font-sans-semibold text-primary-foreground">
					Got it
				</Text>
			</Pressable>
		</View>
	);
}
