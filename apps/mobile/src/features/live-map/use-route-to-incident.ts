import type { Coord } from "@roam/shared";
import * as React from "react";
import { decodePolyline, type LatLng } from "./decode-polyline";
import { fetchRoute } from "./routes-api";

type RouteRequest = { key: string; origin: Coord; destination: Coord };

// ~110 m grid (3 decimals) so GPS jitter doesn't refetch the route on every telemetry frame.
function snapKey(c: Coord): string {
	return `${c.lat.toFixed(3)},${c.lon.toFixed(3)}`;
}

export function useRouteToIncident({
	origin,
	destination,
	enabled,
}: {
	origin: Coord | null;
	destination: Coord | null;
	enabled: boolean;
}): LatLng[] | null {
	const [request, setRequest] = React.useState<RouteRequest | null>(null);
	const [route, setRoute] = React.useState<LatLng[] | null>(null);

	const next =
		enabled && origin && destination
			? {
					key: `${snapKey(origin)}|${snapKey(destination)}`,
					origin,
					destination,
				}
			: null;
	if (next?.key !== request?.key) {
		setRequest(next);
		if (!next) setRoute(null);
	}

	React.useEffect(() => {
		if (!request) return;
		let cancelled = false;
		const loadRoute = async (): Promise<void> => {
			const result = await fetchRoute(
				{ latitude: request.origin.lat, longitude: request.origin.lon },
				{
					latitude: request.destination.lat,
					longitude: request.destination.lon,
				},
			);
			if (cancelled) return;
			if (!result.ok) {
				console.warn("[route]", result.error);
				setRoute(null);
				return;
			}
			setRoute(decodePolyline(result.encodedPolyline));
		};
		loadRoute();
		return () => {
			cancelled = true;
		};
	}, [request]);

	return route;
}
