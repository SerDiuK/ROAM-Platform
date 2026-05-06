import { hsl } from "@roam/ui";
import { useSetAtom } from "jotai";
import * as React from "react";
import { TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { signInAtom } from "@/state/responder";

const PLACEHOLDER_COLOR = hsl("mutedForeground", "dark");

type Props = {
	cachedName: string | null;
};

export function LoginScreen({ cachedName }: Props): React.JSX.Element {
	const signIn = useSetAtom(signInAtom);
	const [name, setName] = React.useState(cachedName ?? "");
	const [pin, setPin] = React.useState("");
	const [pending, setPending] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const pinRef = React.useRef<TextInput>(null);

	const handleSubmit = async (): Promise<void> => {
		if (!name.trim() || pin.length < 4) {
			setError("Enter your name and PIN");
			return;
		}
		setPending(true);
		setError(null);
		const result = await signIn({ name: name.trim(), pin });
		setPending(false);
		if (!result.ok) {
			setError(result.error ?? "Sign-in failed");
			setPin("");
		}
	};

	return (
		<SafeAreaView edges={["top", "bottom"]} className="flex-1 bg-background">
			<View className="flex-1 justify-center px-6 gap-6">
				<View className="gap-2">
					<Text variant="h2">ROAM</Text>
					<Text variant="muted">Responder sign-in</Text>
				</View>

				<View className="gap-3">
					<View>
						<Text variant="muted">Name</Text>
						<TextInput
							value={name}
							onChangeText={setName}
							autoCapitalize="characters"
							autoCorrect={false}
							placeholder="RSP-1"
							placeholderTextColor="#666"
							editable={!pending}
							onSubmitEditing={() => pinRef.current?.focus()}
							returnKeyType="next"
							className="mt-1 rounded-md border border-border bg-input/30 px-3 py-3 font-mono text-lg text-foreground"
						/>
					</View>

					<View>
						<Text variant="muted">PIN</Text>
						<TextInput
							ref={pinRef}
							value={pin}
							onChangeText={setPin}
							secureTextEntry
							keyboardType="number-pad"
							maxLength={12}
							placeholder="••••"
							placeholderTextColor="#666"
							editable={!pending}
							onSubmitEditing={handleSubmit}
							returnKeyType="go"
							className="mt-1 rounded-md border border-border bg-input/30 px-3 py-3 font-mono text-lg text-foreground"
						/>
					</View>

					{error ? <Text className="text-destructive">{error}</Text> : null}

					<Button
						onPress={handleSubmit}
						disabled={pending}
						className="mt-2"
					>
						<Text>{pending ? "Signing in…" : "Sign in"}</Text>
					</Button>
				</View>

				<Text variant="muted" className="text-center">
					Don't have a name? Ask your dispatch admin.
				</Text>
			</View>
		</SafeAreaView>
	);
}
