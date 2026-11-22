import type { Coord } from "@roam/shared";
import * as React from "react";
import { decodePolyline, type LatLng } from "./decode-polyline";
import { fetchRoute } from "./routes-api";

export type RouteState = {
	coordinates: LatLng[] | null;
	error: string | null;
};

const EMPTY: RouteState = { coordinates: null, error: null };

// ~110 m grid (3 decimals) so GPS jitter doesn't refetch the route on every telemetry frame.
function snapKey(c: Coord | null): string {
	if (!c) return "_";
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
}): RouteState {
	const [state, setState] = React.useState<RouteState>(EMPTY);

	const originRef = React.useRef(origin);
	originRef.current = origin;
	const destinationRef = React.useRef(destination);
	destinationRef.current = destination;

	const key = enabled ? `${snapKey(origin)}|${snapKey(destination)}` : null;

	React.useEffect(() => {
		if (!key) {
			setState(EMPTY);
			return;
		}
		const o = originRef.current;
		const d = destinationRef.current;
		if (!o || !d) {
			setState(EMPTY);
			return;
		}
		let cancelled = false;
		void (async () => {
			const result = await fetchRoute(
				{ latitude: o.lat, longitude: o.lon },
				{ latitude: d.lat, longitude: d.lon },
			);
			if (cancelled) return;
			if (!result.ok) {
				console.warn("[route]", result.error);
				setState({ coordinates: null, error: result.error });
				return;
			}
			const coordinates = decodePolyline(result.route.encodedPolyline);
			setState({ coordinates, error: null });
		})();
		return () => {
			cancelled = true;
		};
	}, [key]);

	return state;
}
