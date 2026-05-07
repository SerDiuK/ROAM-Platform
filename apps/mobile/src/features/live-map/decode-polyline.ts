// Google encoded polyline algorithm decoder.
// https://developers.google.com/maps/documentation/utilities/polylinealgorithm
// Inlined (~30 lines) instead of pulling in @mapbox/polyline + its untyped surface.

export type LatLng = { latitude: number; longitude: number };

export function decodePolyline(encoded: string): LatLng[] {
	const result: LatLng[] = [];
	let index = 0;
	let lat = 0;
	let lng = 0;

	while (index < encoded.length) {
		const dlat = decodeNext(encoded, index);
		index = dlat.next;
		lat += dlat.value;

		const dlng = decodeNext(encoded, index);
		index = dlng.next;
		lng += dlng.value;

		result.push({ latitude: lat * 1e-5, longitude: lng * 1e-5 });
	}

	return result;
}

function decodeNext(s: string, start: number): { value: number; next: number } {
	let result = 0;
	let shift = 0;
	let byte = 0;
	let i = start;
	do {
		byte = s.charCodeAt(i++) - 63;
		result |= (byte & 0x1f) << shift;
		shift += 5;
	} while (byte >= 0x20);
	const value = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
	return { value, next: i };
}
