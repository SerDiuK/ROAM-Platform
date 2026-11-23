import { DISPATCH_PUSH_CHANNEL } from "@roam/shared";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { api } from "@/lib/api";

Notifications.setNotificationHandler({
	handleNotification: async () => ({
		shouldShowBanner: true,
		shouldShowList: true,
		shouldPlaySound: true,
		shouldSetBadge: false,
	}),
});

async function ensureAndroidChannel(): Promise<void> {
	if (Platform.OS !== "android") return;
	await Notifications.setNotificationChannelAsync(DISPATCH_PUSH_CHANNEL, {
		name: "Dispatches",
		importance: Notifications.AndroidImportance.MAX,
		sound: "default",
		vibrationPattern: [0, 250, 250, 250],
	});
}

async function ensurePermission(): Promise<boolean> {
	const existing = await Notifications.getPermissionsAsync();
	if (existing.granted) return true;
	if (!existing.canAskAgain) return false;
	const requested = await Notifications.requestPermissionsAsync();
	return requested.granted;
}

function getProjectId(): string | undefined {
	return (
		Constants.expoConfig?.extra?.eas?.projectId ??
		Constants.easConfig?.projectId
	);
}

export async function registerPushToken(): Promise<void> {
	if (!Device.isDevice) return;
	try {
		await ensureAndroidChannel();
		if (!(await ensurePermission())) return;
		const projectId = getProjectId();
		if (!projectId) return;
		const { data: token } = await Notifications.getExpoPushTokenAsync({
			projectId,
		});
		await api.responders.upsertPushToken({ token });
	} catch (err) {
		console.warn("[push] registering the push token failed", err);
	}
}
