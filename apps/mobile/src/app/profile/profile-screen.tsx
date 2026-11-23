import { useNavigation } from "@react-navigation/native";
import * as Clipboard from "expo-clipboard";
import { useAtomValue, useSetAtom } from "jotai";
import * as React from "react";
import { Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { currentResponderAtom } from "@/state/responder";
import { signOutAtom } from "@/state/wallet-auth";

export function ProfileScreen(): React.JSX.Element {
	const responder = useAtomValue(currentResponderAtom);
	const signOut = useSetAtom(signOutAtom);
	const navigation = useNavigation();
	const [copied, setCopied] = React.useState(false);

	const close = React.useCallback(() => navigation.goBack(), [navigation]);

	const walletAddress = responder?.walletAddress;

	const handleCopy = async (): Promise<void> => {
		if (!walletAddress) return;
		await Clipboard.setStringAsync(walletAddress);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	};

	const handleSignOut = async (): Promise<void> => {
		await signOut();
	};

	return (
		<SafeAreaView edges={["top", "bottom"]} className="flex-1 bg-background">
			<View className="flex-row items-center justify-between border-border border-b px-4 py-3">
				<Text variant="h3">Profile</Text>
				<Pressable onPress={close} hitSlop={12}>
					<Text className="text-primary">Close</Text>
				</Pressable>
			</View>

			<View className="gap-4 px-4 py-6">
				<Field
					label="Name"
					value={responder?.displayName ?? responder?.name ?? "—"}
				/>
				<Field label="Role" value={responder?.role ?? "—"} />
				<Field label="Availability" value={responder?.availability ?? "—"} />

				{walletAddress ? (
					<View>
						<Text variant="muted">Wallet address</Text>
						<Text selectable className="mt-1 font-mono text-sm">
							{walletAddress}
						</Text>
						<Button
							variant="outline"
							size="sm"
							className="mt-2 self-start"
							onPress={handleCopy}
						>
							<Text>{copied ? "Copied" : "Copy"}</Text>
						</Button>
					</View>
				) : null}

				<View className="mt-8 border-border border-t pt-6">
					<Button
						variant="destructive"
						onPress={handleSignOut}
						className="self-start"
					>
						<Text>Sign out</Text>
					</Button>
				</View>
			</View>
		</SafeAreaView>
	);
}

function Field({
	label,
	value,
}: {
	label: string;
	value: string;
}): React.JSX.Element {
	return (
		<View>
			<Text variant="muted">{label}</Text>
			<Text className="mt-1">{value}</Text>
		</View>
	);
}
