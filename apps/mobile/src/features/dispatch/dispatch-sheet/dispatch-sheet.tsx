import * as React from "react";
import { ScrollView, useWindowDimensions, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Sheet, SheetTitle } from "@/components/ui/sheet";
import { Text } from "@/components/ui/text";
import type { DispatchInboxState } from "../use-dispatch-inbox";
import { ConflictBody } from "./conflict-body";
import { IncomingBody } from "./incoming-body";
import { OnSceneBody } from "./on-scene-body";

type Props = {
	state: DispatchInboxState;
	onAccept: () => void;
	onDecline: () => void;
	onClear: () => void;
	onDismiss: () => void;
};

// Drawer that opens on incoming-dispatch push. Mirrors the vehicle-details
// sheet pattern (Sheet + Body) — stateless w.r.t. dispatch fetching, all data
// flows in via `state` from useDispatchInbox.
export function DispatchSheet({
	state,
	onAccept,
	onDecline,
	onClear,
	onDismiss,
}: Props): React.JSX.Element {
	const open = state.kind !== "idle";

	return (
		<Sheet
			open={open}
			onOpenChange={(next) => {
				if (!next) onDismiss();
			}}
		>
			<DispatchSheetBody
				state={state}
				onAccept={onAccept}
				onDecline={onDecline}
				onClear={onClear}
				onDismiss={onDismiss}
			/>
		</Sheet>
	);
}

function DispatchSheetBody({
	state,
	onAccept,
	onDecline,
	onClear,
	onDismiss,
}: Props): React.JSX.Element | null {
	if (state.kind === "idle") return null;

	if (state.kind === "loading") {
		return (
			<View className="gap-2 pb-2">
				<SheetTitle>Incoming dispatch</SheetTitle>
				<Text className="text-sm text-muted-foreground">
					Loading dispatch details…
				</Text>
			</View>
		);
	}

	if (state.kind === "error") {
		return (
			<DispatchSheetLayout
				footer={
					<Button
						onPress={onDismiss}
						variant="outline"
						size="lg"
						accessibilityLabel="Dismiss"
					>
						<Text className="font-sans-semibold">Dismiss</Text>
					</Button>
				}
			>
				<SheetTitle>Couldn't load dispatch</SheetTitle>
				<Text className="text-sm text-destructive">{state.message}</Text>
			</DispatchSheetLayout>
		);
	}

	if (state.kind === "claimed" || state.kind === "clearing") {
		return (
			<OnSceneBody
				data={state.data}
				clearing={state.kind === "clearing"}
				onClear={onClear}
				onDismiss={onDismiss}
			/>
		);
	}

	if (state.kind === "conflict") {
		return (
			<ConflictBody
				data={state.data}
				message={state.message}
				onDismiss={onDismiss}
			/>
		);
	}

	const submitting = state.kind === "submitting";
	const decision = state.kind === "submitting" ? state.decision : null;

	return (
		<IncomingBody
			data={state.data}
			submittingDecision={decision}
			disabled={submitting}
			onAccept={onAccept}
			onDecline={onDecline}
			onDismiss={onDismiss}
		/>
	);
}

// Caps the body at 60% of viewport height and scrolls the middle, keeping
// the action footer (Accept/Decline/Clear/Dismiss) pinned so the responder
// never has to scroll to reach the primary action.
export function DispatchSheetLayout({
	children,
	footer,
}: {
	children: React.ReactNode;
	footer?: React.ReactNode;
}): React.JSX.Element {
	const { height } = useWindowDimensions();
	return (
		<View style={{ maxHeight: height * 0.6 }}>
			<ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator>
				<View className="gap-3">{children}</View>
			</ScrollView>
			{footer ? <View className="gap-3 pt-3">{footer}</View> : null}
		</View>
	);
}
