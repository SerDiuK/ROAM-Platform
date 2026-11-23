import { config } from "@/config";
import type { LatLng } from "./decode-polyline";

const ROUTES_ENDPOINT =
	"https://routes.googleapis.com/directions/v2:computeRoutes";

type FetchRouteResult =
	| { ok: true; encodedPolyline: string }
	| { ok: false; error: string };

export async function fetchRoute(
	origin: LatLng,
	destination: LatLng,
): Promise<FetchRouteResult> {
	const body = {
		origin: { location: { latLng: origin } },
		destination: { location: { latLng: destination } },
		travelMode: "DRIVE",
		routingPreference: "TRAFFIC_AWARE",
	};

	let json: unknown;
	try {
		const res = await fetch(ROUTES_ENDPOINT, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Goog-Api-Key": config.GOOGLE_MAPS_API_KEY,
				"X-Goog-FieldMask": "routes.polyline.encodedPolyline",
			},
			body: JSON.stringify(body),
		});
		if (!res.ok) {
			return { ok: false, error: `Routes API HTTP ${res.status}` };
		}
		json = await res.json();
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : "Network error";
		return { ok: false, error: message };
	}

	const encodedPolyline = parseEncodedPolyline(json);
	if (!encodedPolyline) {
		return { ok: false, error: "Routes API returned no routes" };
	}
	return { ok: true, encodedPolyline };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function parseEncodedPolyline(json: unknown): string | null {
	if (!isRecord(json) || !Array.isArray(json.routes)) return null;
	const first: unknown = json.routes[0];
	if (!isRecord(first) || !isRecord(first.polyline)) return null;
	const { encodedPolyline } = first.polyline;
	return typeof encodedPolyline === "string" ? encodedPolyline : null;
}
