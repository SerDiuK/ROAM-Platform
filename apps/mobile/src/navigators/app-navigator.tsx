import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { HomeScreen } from "@/app/home";
import { ProfileScreen } from "@/app/profile";
import type { RootStackParamList } from "./navigation-types";

const Stack = createNativeStackNavigator<RootStackParamList>();

export function AppNavigator(): React.JSX.Element {
	return (
		<Stack.Navigator screenOptions={{ headerShown: false }}>
			<Stack.Screen name="Home" component={HomeScreen} />
			<Stack.Screen
				name="Profile"
				options={{ presentation: "modal", animation: "slide_from_bottom" }}
			>
				{({ navigation }) => (
					<ProfileScreen onClose={() => navigation.goBack()} />
				)}
			</Stack.Screen>
		</Stack.Navigator>
	);
}
