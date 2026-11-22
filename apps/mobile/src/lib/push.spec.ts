import { beforeEach, describe, expect, it, vi } from "vitest";

const setNotificationHandler = vi.fn();
const setNotificationChannelAsync = vi.fn(async () => undefined);
const getPermissionsAsync = vi.fn();
const requestPermissionsAsync = vi.fn();
const getExpoPushTokenAsync = vi.fn();

vi.mock("expo-notifications", () => ({
	setNotificationHandler,
	setNotificationChannelAsync,
	getPermissionsAsync,
	requestPermissionsAsync,
	getExpoPushTokenAsync,
	AndroidImportance: { MAX: 5 },
}));

const isDevice = { value: true };
vi.mock("expo-device", () => ({
	get isDevice() {
		return isDevice.value;
	},
}));

const projectId: { value: string | undefined } = { value: "test-project" };
vi.mock("expo-constants", () => ({
	default: {
		get expoConfig() {
			return projectId.value
				? { extra: { eas: { projectId: projectId.value } } }
				: { extra: {} };
		},
		get easConfig() {
			return projectId.value ? { projectId: projectId.value } : undefined;
		},
	},
}));

vi.mock("react-native", () => ({
	Platform: { OS: "ios" },
}));

const upsertPushToken = vi.fn(async () => ({ tokenCount: 1 }));
vi.mock("@/lib/api", () => ({
	api: { responders: { upsertPushToken } },
}));

const { registerPushToken } = await import("./push.js");

describe("registerPushToken", () => {
	beforeEach(() => {
		setNotificationHandler.mockClear();
		setNotificationChannelAsync.mockClear();
		getPermissionsAsync.mockReset();
		requestPermissionsAsync.mockReset();
		getExpoPushTokenAsync.mockReset();
		upsertPushToken.mockClear();
		upsertPushToken.mockResolvedValue({ tokenCount: 1 });
		isDevice.value = true;
		projectId.value = "test-project";
	});

	it("registers the Expo token against the responder and returns ok with the new tokenCount", async () => {
		getPermissionsAsync.mockResolvedValue({
			granted: true,
			canAskAgain: false,
		});
		getExpoPushTokenAsync.mockResolvedValue({
			data: "ExponentPushToken[abc-123]",
		});
		upsertPushToken.mockResolvedValue({ tokenCount: 2 });

		const result = await registerPushToken();

		expect(result).toEqual({
			ok: true,
			token: "ExponentPushToken[abc-123]",
			tokenCount: 2,
		});
		expect(upsertPushToken).toHaveBeenCalledTimes(1);
		expect(upsertPushToken).toHaveBeenCalledWith({
			token: "ExponentPushToken[abc-123]",
		});
	});

	it("requests permission when not yet granted, then proceeds when accepted", async () => {
		getPermissionsAsync.mockResolvedValue({
			granted: false,
			canAskAgain: true,
		});
		requestPermissionsAsync.mockResolvedValue({ granted: true });
		getExpoPushTokenAsync.mockResolvedValue({
			data: "ExponentPushToken[after-prompt]",
		});

		const result = await registerPushToken();

		expect(requestPermissionsAsync).toHaveBeenCalledTimes(1);
		expect(result.ok).toBe(true);
		expect(upsertPushToken).toHaveBeenCalledTimes(1);
	});

	it("returns ok=false silently and does not hit the backend when permission is denied", async () => {
		getPermissionsAsync.mockResolvedValue({
			granted: false,
			canAskAgain: true,
		});
		requestPermissionsAsync.mockResolvedValue({ granted: false });

		const result = await registerPushToken();

		expect(result).toEqual({
			ok: false,
			reason: "Notification permission denied",
		});
		expect(upsertPushToken).not.toHaveBeenCalled();
		expect(getExpoPushTokenAsync).not.toHaveBeenCalled();
	});

	it("returns ok=false silently when permission was previously denied and cannot be asked again", async () => {
		getPermissionsAsync.mockResolvedValue({
			granted: false,
			canAskAgain: false,
		});

		const result = await registerPushToken();

		expect(result).toEqual({
			ok: false,
			reason: "Notification permission denied",
		});
		expect(requestPermissionsAsync).not.toHaveBeenCalled();
		expect(upsertPushToken).not.toHaveBeenCalled();
	});

	it("returns ok=false when not running on a physical device (simulator/emulator)", async () => {
		isDevice.value = false;

		const result = await registerPushToken();

		expect(result.ok).toBe(false);
		expect(getPermissionsAsync).not.toHaveBeenCalled();
		expect(upsertPushToken).not.toHaveBeenCalled();
	});

	it("propagates errors from the backend so the boot atom can surface them", async () => {
		getPermissionsAsync.mockResolvedValue({ granted: true });
		getExpoPushTokenAsync.mockResolvedValue({
			data: "ExponentPushToken[ok]",
		});
		upsertPushToken.mockRejectedValue(new Error("network down"));

		await expect(registerPushToken()).rejects.toThrow("network down");
	});

	it("returns ok=false when the Expo project id has not been configured", async () => {
		projectId.value = undefined;
		getPermissionsAsync.mockResolvedValue({ granted: true });

		const result = await registerPushToken();

		expect(result.ok).toBe(false);
		expect(getExpoPushTokenAsync).not.toHaveBeenCalled();
		expect(upsertPushToken).not.toHaveBeenCalled();
	});

	it("returns ok=false silently when getExpoPushTokenAsync throws (Expo Go Android / missing FCM)", async () => {
		getPermissionsAsync.mockResolvedValue({ granted: true });
		getExpoPushTokenAsync.mockRejectedValue(
			new Error("Android Push notifications removed from Expo Go"),
		);

		const result = await registerPushToken();

		expect(result).toEqual({
			ok: false,
			reason: "Android Push notifications removed from Expo Go",
		});
		expect(upsertPushToken).not.toHaveBeenCalled();
	});
});
