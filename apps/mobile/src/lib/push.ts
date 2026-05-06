import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { api } from "@/lib/api";

// Foreground notifications: surface the alert + play sound. Without this the
// OS suppresses the banner when the app is open, which makes demoing painful.
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

// Registers this device's Expo push token for the currently signed-in responder.
// The backend resolves the owning responder from the auth token (so the same
// device can be reassigned by signing in as someone else). Idempotent — the
// backend de-dups on equal token. The `responderId` argument is kept for log
// affinity only; pass the responder id from the auth state.
export async function registerPushToken(
	responderId: string,
): Promise<RegisterPushTokenResult> {
	// TEMP(emulator-push-test): bypassed Device.isDevice so the Android emulator
	// (with Google Play Services) can register a push token for smoke testing.
	if (!Device.isDevice) {
		console.warn("[push] Device.isDevice=false (emulator); attempting registration anyway");
	}

	await ensureAndroidChannel();

	const granted = await ensurePermission();
	if (!granted) {
		return { ok: false, reason: "Notification permission denied" };
	}

	const projectId = getProjectId();
	if (!projectId) {
		return { ok: false, reason: "Expo projectId not configured (run `eas init`)" };
	}

	let token: string;
	try {
		const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
		token = tokenResponse.data;
	} catch (err) {
		// Expo Go on Android (SDK 53+) no longer supports remote push, and dev
		// builds without FCM credentials throw here too. Fail soft so the login
		// flow still completes — the responder can use the app, just won't get
		// push-driven dispatches until a proper build is in their hands.
		const reason = err instanceof Error ? err.message : "Failed to get push token";
		return { ok: false, reason };
	}

	const { tokenCount } = await api.responders.upsertPushToken({ token });

	// responderId only used as a sanity-check log key; if it ever drifts from
	// ctx.user.id on the backend that's a sign-out/sign-in race we should see.
	void responderId;

	return { ok: true, token, tokenCount };
}
