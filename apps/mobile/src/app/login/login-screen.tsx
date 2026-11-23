import { DEMO_RESPONDERS } from "@roam/shared";
import { useAtomValue, useSetAtom } from "jotai";
import * as React from "react";
import { Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { mwaAvailableAtom, signInWithSeekerAtom } from "@/state/wallet-auth";

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

	const startSignIn = React.useCallback(
		async (name?: string): Promise<void> => {
			setPending(true);
			setError(null);
			try {
				const result = await signIn({ name });
				switch (result.kind) {
					case "ok":
						return;
					case "wallet-unbound":
						setPendingPubkey(result.pubkey);
						setPickerOpen(true);
						return;
					case "responder-already-bound":
						setError(
							"That responder is already bound to another Seeker. Pick another name.",
						);
						return;
					case "cancelled":
						return;
					case "error":
						setError(result.message);
						return;
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : "Sign-in failed");
			} finally {
				setPending(false);
			}
		},
		[signIn],
	);

	const signInWithSeeker = React.useCallback(
		() => startSignIn(),
		[startSignIn],
	);

	const closePicker = React.useCallback(() => {
		setPickerOpen(false);
		setPendingPubkey(null);
		setError(null);
	}, []);

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
						{DEMO_RESPONDERS.map(({ name }) => (
							<ResponderNameButton
								key={name}
								name={name}
								highlighted={name === cachedName}
								disabled={pending}
								onPick={startSignIn}
							/>
						))}
					</View>
					{error ? <Text className="text-destructive">{error}</Text> : null}
					<Pressable onPress={closePicker}>
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

				<Button onPress={signInWithSeeker} disabled={pending}>
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

function ResponderNameButton({
	name,
	highlighted,
	disabled,
	onPick,
}: {
	name: string;
	highlighted: boolean;
	disabled: boolean;
	onPick: (name: string) => Promise<void>;
}): React.JSX.Element {
	const pick = React.useCallback(() => onPick(name), [onPick, name]);
	return (
		<Button
			variant={highlighted ? "default" : "outline"}
			onPress={pick}
			disabled={disabled}
		>
			<Text>{name}</Text>
		</Button>
	);
}
