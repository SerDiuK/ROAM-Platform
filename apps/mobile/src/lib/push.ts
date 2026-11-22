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
	await Notifications.setNotificationChannelAsync("dispatch", {
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

export type RegisterPushTokenResult =
	| { ok: true; token: string; tokenCount: number }
	| { ok: false; reason: string };

export async function registerPushToken(): Promise<RegisterPushTokenResult> {
	if (!Device.isDevice) {
		return { ok: false, reason: "Push notifications need a physical device" };
	}

	await ensureAndroidChannel();

	const granted = await ensurePermission();
	if (!granted) {
		return { ok: false, reason: "Notification permission denied" };
	}

	const projectId = getProjectId();
	if (!projectId) {
		return {
			ok: false,
			reason: "Expo projectId not configured (run `eas init`)",
		};
	}

	let token: string;
	try {
		const tokenResponse = await Notifications.getExpoPushTokenAsync({
			projectId,
		});
		token = tokenResponse.data;
	} catch (err) {
		// Expo Go on Android (SDK 53+) and builds without FCM credentials throw here, so fail soft.
		const reason =
			err instanceof Error ? err.message : "Failed to get push token";
		return { ok: false, reason };
	}

	const { tokenCount } = await api.responders.upsertPushToken({ token });

	return { ok: true, token, tokenCount };
}
