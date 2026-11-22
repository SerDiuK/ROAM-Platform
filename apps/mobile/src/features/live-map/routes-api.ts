import Constants from "expo-constants";

const ROUTES_ENDPOINT =
	"https://routes.googleapis.com/directions/v2:computeRoutes";

export type LatLng = { latitude: number; longitude: number };

export type RouteResult = {
	encodedPolyline: string;
	distanceMeters: number;
	durationSeconds: number;
};

export type FetchRouteResult =
	| { ok: true; route: RouteResult }
	| { ok: false; error: string };

function getApiKey(): string | null {
	const key = Constants.expoConfig?.extra?.googleMapsApiKey;
	return typeof key === "string" && key.length > 0 ? key : null;
}

export async function fetchRoute(
	origin: LatLng,
	destination: LatLng,
): Promise<FetchRouteResult> {
	const apiKey = getApiKey();
	if (!apiKey) {
		return {
			ok: false,
			error: "Google Maps API key missing in expoConfig.extra",
		};
	}

	const body = {
		origin: { location: { latLng: origin } },
		destination: { location: { latLng: destination } },
		travelMode: "DRIVE",
		routingPreference: "TRAFFIC_AWARE",
	};

	let res: Response;
	try {
		res = await fetch(ROUTES_ENDPOINT, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Goog-Api-Key": apiKey,
				"X-Goog-FieldMask":
					"routes.polyline.encodedPolyline,routes.distanceMeters,routes.duration",
			},
			body: JSON.stringify(body),
		});
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : "Network error";
		return { ok: false, error: message };
	}

	if (!res.ok) {
		return { ok: false, error: `Routes API HTTP ${res.status}` };
	}

	const json: unknown = await res.json();
	const route = parseFirstRoute(json);
	if (!route) {
		return { ok: false, error: "Routes API returned no routes" };
	}
	return { ok: true, route };
}

function parseFirstRoute(json: unknown): RouteResult | null {
	if (
		typeof json !== "object" ||
		json === null ||
		!("routes" in json) ||
		!Array.isArray((json as { routes?: unknown }).routes)
	) {
		return null;
	}
	const first = (json as { routes: unknown[] }).routes[0];
	if (typeof first !== "object" || first === null) return null;
	const r = first as {
		polyline?: { encodedPolyline?: unknown };
		distanceMeters?: unknown;
		duration?: unknown;
	};
	const encodedPolyline = r.polyline?.encodedPolyline;
	if (typeof encodedPolyline !== "string") return null;
	const distanceMeters =
		typeof r.distanceMeters === "number" ? r.distanceMeters : 0;
	const durationSeconds = parseDurationSeconds(r.duration);
	return { encodedPolyline, distanceMeters, durationSeconds };
}

function parseDurationSeconds(value: unknown): number {
	if (typeof value !== "string") return 0;
	const match = value.match(/^(\d+)s$/);
	return match ? Number(match[1]) : 0;
}
