import * as Clipboard from "expo-clipboard";
import { useAtomValue, useSetAtom } from "jotai";
import * as React from "react";
import { Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { currentResponderAtom, signOutAtom } from "@/state/responder";

type Props = {
	onClose: () => void;
};

export function ProfileScreen({ onClose }: Props): React.JSX.Element {
	const responder = useAtomValue(currentResponderAtom);
	const signOut = useSetAtom(signOutAtom);
	const [copied, setCopied] = React.useState(false);

	const walletAddress = responder?.walletAddress;

	const handleCopy = async (): Promise<void> => {
		if (!walletAddress) return;
		await Clipboard.setStringAsync(walletAddress);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	};

	const handleSignOut = async (): Promise<void> => {
		await signOut();
		// AuthGate re-renders into Login on its own once authState flips. The
		// Profile modal sits inside the signed-in branch, so it'll unmount as
		// the branch tears down — no need to call onClose explicitly.
	};

	return (
		<SafeAreaView edges={["top", "bottom"]} className="flex-1 bg-background">
			<View className="flex-row items-center justify-between border-border border-b px-4 py-3">
				<Text variant="h3">Profile</Text>
				<Pressable onPress={onClose} hitSlop={12}>
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

				<View>
					<Text variant="muted">Wallet address</Text>
					{walletAddress ? (
						<>
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
						</>
					) : (
						<Text className="mt-1 text-muted-foreground">Provisioning…</Text>
					)}
				</View>

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
