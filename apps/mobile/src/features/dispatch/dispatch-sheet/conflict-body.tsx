import * as React from "react";
import { Button } from "@/components/ui/button";
import { SheetTitle } from "@/components/ui/sheet";
import { Text } from "@/components/ui/text";
import type { DispatchInboxData } from "../use-dispatch-inbox";
import { DispatchSheetLayout } from "./dispatch-sheet";

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
		<DispatchSheetLayout
			footer={
				<Button onPress={onDismiss} size="lg" accessibilityLabel="Close">
					<Text className="font-sans-semibold">Got it</Text>
				</Button>
			}
		>
			<SheetTitle>Already claimed</SheetTitle>
			<Text className="text-sm text-muted-foreground">{human}</Text>
			<Text className="text-2xs text-muted-foreground">
				INC-{data.incident._id.slice(0, 8).toUpperCase()}
			</Text>
		</DispatchSheetLayout>
	);
}
