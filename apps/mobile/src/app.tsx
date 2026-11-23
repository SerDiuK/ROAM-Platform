import "../global.css";
import {
	Inter_400Regular,
	Inter_500Medium,
	Inter_600SemiBold,
	Inter_700Bold,
	useFonts,
} from "@expo-google-fonts/inter";
import { NavigationContainer } from "@react-navigation/native";
import { PortalHost } from "@rn-primitives/portal";
import { StatusBar } from "expo-status-bar";
import { useAtomValue, useSetAtom } from "jotai";
import * as React from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { LoginScreen } from "@/app/login/login-screen";
import { Text } from "@/components/ui/text";
import { NAV_THEME } from "@/lib/theme";
import { AppNavigator } from "@/navigators/app-navigator";
import { authStateAtom, bootAuthAtom } from "@/state/responder";
import { useTokenRenewal } from "@/state/use-token-renewal";

export function App(): React.JSX.Element | null {
	const [fontsLoaded] = useFonts({
		Inter_400Regular,
		Inter_500Medium,
		Inter_600SemiBold,
		Inter_700Bold,
	});

	if (!fontsLoaded) return null;

	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			<SafeAreaProvider>
				<AuthGate />
				<PortalHost />
				<StatusBar style="light" />
			</SafeAreaProvider>
		</GestureHandlerRootView>
	);
}

function AuthGate(): React.JSX.Element {
	const auth = useAtomValue(authStateAtom);
	const boot = useSetAtom(bootAuthAtom);

	React.useEffect(() => {
		boot();
	}, [boot]);

	if (auth.kind === "unknown") {
		return <Splash />;
	}

	if (auth.kind === "signed-out") {
		return <LoginScreen cachedName={auth.cachedName} />;
	}

	return <SignedInShell />;
}

// Renewal must only run signed in: an UNAUTHORIZED refresh signs out.
function SignedInShell(): React.JSX.Element {
	useTokenRenewal();
	return (
		<NavigationContainer theme={NAV_THEME}>
			<AppNavigator />
		</NavigationContainer>
	);
}

function Splash(): React.JSX.Element {
	return (
		<View className="flex-1 items-center justify-center bg-background">
			<Text variant="muted">Loading…</Text>
		</View>
	);
}
