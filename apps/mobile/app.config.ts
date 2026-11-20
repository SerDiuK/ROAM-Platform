import type { ExpoConfig } from "expo/config";

const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
if (!googleMapsApiKey) {
	throw new Error(
		"GOOGLE_MAPS_API_KEY is not set. Add it to apps/mobile/.env.local (see .env.example).",
	);
}

const config: ExpoConfig = {
	name: "ROAM Mobile",
	slug: "roam-mobile",
	owner: "tgmgoethals",
	version: "0.0.1",
	orientation: "portrait",
	scheme: "roam-mobile",
	icon: "./assets/icon.png",
	userInterfaceStyle: "dark",
	newArchEnabled: true,
	plugins: [
		[
			"expo-location",
			{
				locationWhenInUsePermission:
					"ROAM uses your location to center the map on your position.",
			},
		],
		"expo-font",
		[
			"expo-notifications",
			{
				icon: "./assets/adaptive-icon-monochrome.png",
				color: "#38BDF8",
			},
		],
		"expo-secure-store",
		[
			"expo-build-properties",
			{
				android: { minSdkVersion: 27 },
			},
		],
	],
	ios: {
		supportsTablet: false,
		bundleIdentifier: "dev.tgmgoethals.roam.mobile",
		icon: "./assets/icon.png",
	},
	android: {
		package: "dev.tgmgoethals.roam.mobile",
		googleServicesFile: "./google-services.json",
		config: {
			googleMaps: { apiKey: googleMapsApiKey },
		},
		adaptiveIcon: {
			foregroundImage: "./assets/adaptive-icon.png",
			monochromeImage: "./assets/adaptive-icon-monochrome.png",
			backgroundColor: "#000000",
		},
		permissions: [
			"android.permission.ACCESS_COARSE_LOCATION",
			"android.permission.ACCESS_FINE_LOCATION",
		],
	},
	web: {
		bundler: "metro",
		favicon: "./assets/favicon.ico",
	},
	extra: {
		eas: {
			projectId: "7021fefb-983f-422f-866f-2d7b4d262e77",
		},
		googleMapsApiKey,
	},
};

export { config as default };
