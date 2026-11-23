import * as Dialog from "@rn-primitives/dialog";
import { cn } from "@roam/ui";
import type * as React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
	FadeIn,
	FadeOut,
	SlideInDown,
	SlideOutDown,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/ui/text";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type SheetProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	children: React.ReactNode;
};

function Sheet({
	open,
	onOpenChange,
	children,
}: SheetProps): React.JSX.Element {
	const insets = useSafeAreaInsets();
	return (
		<Dialog.Root open={open} onOpenChange={onOpenChange}>
			<Dialog.Portal>
				<Dialog.Overlay asChild closeOnPress>
					<AnimatedPressable
						entering={FadeIn.duration(180)}
						exiting={FadeOut.duration(180)}
						style={styles.overlay}
					/>
				</Dialog.Overlay>
				<Dialog.Content asChild>
					<Animated.View
						entering={SlideInDown.duration(240)}
						exiting={SlideOutDown.duration(200)}
						className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-background px-5 pt-2"
						style={{ paddingBottom: 24 + insets.bottom }}
					>
						<View className="mb-3.5 h-1 w-10 self-center rounded-sm bg-foreground/25" />
						{children}
					</Animated.View>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}

type SheetTitleProps = React.ComponentProps<typeof Text>;

function SheetTitle({
	className,
	...props
}: SheetTitleProps): React.JSX.Element {
	return (
		<Dialog.Title asChild>
			<Text
				className={cn("text-lg font-semibold text-foreground", className)}
				{...props}
			/>
		</Dialog.Title>
	);
}

type SheetDescriptionProps = React.ComponentProps<typeof Text>;

function SheetDescription({
	className,
	...props
}: SheetDescriptionProps): React.JSX.Element {
	return (
		<Dialog.Description asChild>
			<Text
				className={cn("text-sm text-muted-foreground", className)}
				{...props}
			/>
		</Dialog.Description>
	);
}

const SheetClose = Dialog.Close;

const styles = StyleSheet.create({
	overlay: {
		...StyleSheet.absoluteFillObject,
	},
});

export { Sheet, SheetClose, SheetDescription, SheetTitle };
