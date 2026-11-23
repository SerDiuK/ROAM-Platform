import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { HomeScreen } from "@/app/home/home-screen";
import { ProfileScreen } from "@/app/profile/profile-screen";
import type { RootStackParamList } from "./navigation-types";

const Stack = createNativeStackNavigator<RootStackParamList>();

export function AppNavigator(): React.JSX.Element {
	return (
		<Stack.Navigator screenOptions={{ headerShown: false }}>
			<Stack.Screen name="Home" component={HomeScreen} />
			<Stack.Screen
				name="Profile"
				component={ProfileScreen}
				options={{ presentation: "modal", animation: "slide_from_bottom" }}
			/>
		</Stack.Navigator>
	);
}
