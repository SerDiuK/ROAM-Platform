import { useAtomValue, useSetAtom } from "jotai";
import * as React from "react";
import { Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { mwaAvailableAtom, signInWithSeekerAtom } from "@/state/wallet-auth";

// Must match the responder names the backend seeds; unknown names are rejected.
const RESPONDER_NAMES = ["THOMAS-1", "RSP-1", "RSP-2", "DSP-1"];

type Props = {
	cachedName: string | null;
};

export function LoginScreen({ cachedName }: Props): React.JSX.Element {
	const mwaAvailable = useAtomValue(mwaAvailableAtom);
	const signIn = useSetAtom(signInWithSeekerAtom);

	const [pending, setPending] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [pickerOpen, setPickerOpen] = React.useState(false);
	const [pendingPubkey, setPendingPubkey] = React.useState<string | null>(null);

	const startSignIn = async (name?: string): Promise<void> => {
		setPending(true);
		setError(null);
		const result = await signIn({ name });
		setPending(false);
		switch (result.kind) {
			case "ok":
				return;
			case "wallet-unbound":
				setPendingPubkey(result.pubkey);
				setPickerOpen(true);
				return;
			case "cancelled":
				return;
			case "error":
				setError(result.message);
				return;
		}
	};

	if (!mwaAvailable) {
		return (
			<SafeAreaView edges={["top", "bottom"]} className="flex-1 bg-background">
				<View className="flex-1 justify-center px-6 gap-3">
					<Text variant="h2">ROAM</Text>
					<Text variant="muted">
						ROAM mobile requires a Solana Seeker phone. Open the app on a Seeker
						(Android) device — sign-in is fingerprint-only.
					</Text>
				</View>
			</SafeAreaView>
		);
	}

	if (pickerOpen && pendingPubkey) {
		return (
			<SafeAreaView edges={["top", "bottom"]} className="flex-1 bg-background">
				<View className="flex-1 justify-center px-6 gap-4">
					<View className="gap-2">
						<Text variant="h2">Pick your responder</Text>
						<Text variant="muted">
							This Seeker isn't bound to a responder yet. Pick the name you'll
							sign in as — it will be tied to your Seeker pubkey.
						</Text>
						<Text
							className="font-mono text-xs text-muted-foreground"
							selectable
						>
							{pendingPubkey}
						</Text>
					</View>
					<View className="gap-2">
						{RESPONDER_NAMES.map((name) => (
							<Button
								key={name}
								variant={name === cachedName ? "default" : "outline"}
								onPress={() => {
									void startSignIn(name);
								}}
								disabled={pending}
							>
								<Text>{name}</Text>
							</Button>
						))}
					</View>
					{error ? <Text className="text-destructive">{error}</Text> : null}
					<Pressable
						onPress={() => {
							setPickerOpen(false);
							setPendingPubkey(null);
							setError(null);
						}}
					>
						<Text className="text-center text-muted-foreground">Cancel</Text>
					</Pressable>
				</View>
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView edges={["top", "bottom"]} className="flex-1 bg-background">
			<View className="flex-1 justify-center px-6 gap-6">
				<View className="gap-2">
					<Text variant="h2">ROAM</Text>
					<Text variant="muted">Sign in with your Solana Seeker.</Text>
				</View>

				<Button
					onPress={() => {
						void startSignIn();
					}}
					disabled={pending}
				>
					<Text>
						{pending ? "Waiting on fingerprint…" : "Sign in with Seeker"}
					</Text>
				</Button>

				{error ? <Text className="text-destructive">{error}</Text> : null}

				<Text variant="muted" className="text-center">
					{cachedName
						? `Last signed in as ${cachedName}.`
						: "First sign-in on this Seeker — you'll pick a responder name next."}
				</Text>
			</View>
		</SafeAreaView>
	);
}
