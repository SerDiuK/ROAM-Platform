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
import { colorScheme } from "nativewind";
import * as React from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { LoginScreen } from "@/app/login";
import { Text } from "@/components/ui/text";
import { NAV_THEME } from "@/lib/theme";
import { AppNavigator } from "@/navigators/app-navigator";
import { authStateAtom, bootAuthAtom } from "@/state/responder";
import { RealtimeProvider } from "@/state/realtime-provider";

// Dispatch app — dark only, matching the dispatcher dashboard.
colorScheme.set("dark");

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

// Decides whether to show the Login screen or the signed-in app shell. Boot
// kicks off a token-validation call on first paint; while it's in flight we
// render a small splash to avoid flashing the Login form on a returning user
// with a valid cached token.
function AuthGate(): React.JSX.Element {
	const auth = useAtomValue(authStateAtom);
	const boot = useSetAtom(bootAuthAtom);

	React.useEffect(() => {
		void boot();
	}, [boot]);

	if (auth.kind === "unknown") {
		return <Splash />;
	}

	if (auth.kind === "signed-out") {
		return <LoginScreen cachedName={auth.cachedName} />;
	}

	return (
		<RealtimeProvider>
			<NavigationContainer theme={NAV_THEME.dark}>
				<AppNavigator />
			</NavigationContainer>
		</RealtimeProvider>
	);
}

function Splash(): React.JSX.Element {
	return (
		<View className="flex-1 items-center justify-center bg-background">
			<Text variant="muted">Loading…</Text>
		</View>
	);
}
