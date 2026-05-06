export interface GpsFix {
	lat: number;
	lon: number;
	speed: number;
	heading: number;
	timestamp: number;
}

const KNOTS_TO_KMH = 1.852;

/**
 * Convert NMEA coordinate format DDMM.MMMM (lat) or DDDMM.MMMM (lon)
 * to decimal degrees. Negate for South / West hemispheres.
 */
function nmeaCoordToDecimal(
	raw: string,
	hemisphere: string,
	degreeDigits: number,
): number {
	const degrees = parseInt(raw.slice(0, degreeDigits), 10);
	const minutes = parseFloat(raw.slice(degreeDigits));
	let decimal = degrees + minutes / 60;
	if (hemisphere === "S" || hemisphere === "W") {
		decimal = -decimal;
	}
	return decimal;
}

/**
 * Parse an RMC NMEA sentence into a GpsFix. Accepts any talker ID — $GPRMC
 * (GPS-only chips), $GNRMC (multi-constellation chips like SIM7670G), $GLRMC,
 * etc. The payload format is identical across talkers.
 *
 * Format: $xxRMC,hhmmss.ss,A,ddmm.mmmm,N,dddmm.mmmm,W,knots,heading,ddmmyy,...*checksum
 *
 * Returns null for non-RMC lines, void fixes (status 'V'), and parse errors.
 */
export function parseNmea(line: string): GpsFix | null {
	try {
		const trimmed = line.trim();
		if (!/^\$[A-Z]{2}RMC,/.test(trimmed)) return null;

		// Strip checksum portion before splitting
		const body = trimmed.split("*")[0];
		const fields = body.split(",");
		if (fields.length < 10) return null;

		// Status: 'A' = active, 'V' = void
		if (fields[2] !== "A") return null;

		const rawLat = fields[3];
		const latHemi = fields[4];
		const rawLon = fields[5];
		const lonHemi = fields[6];

		if (!rawLat || !latHemi || !rawLon || !lonHemi) return null;

		const lat = nmeaCoordToDecimal(rawLat, latHemi, 2);
		const lon = nmeaCoordToDecimal(rawLon, lonHemi, 3);

		const speed = fields[7] ? parseFloat(fields[7]) * KNOTS_TO_KMH : 0;
		const heading = fields[8] ? parseFloat(fields[8]) : 0;

		// Build timestamp from time (field 1: hhmmss.ss) and date (field 9: ddmmyy)
		const timeStr = fields[1];
		const dateStr = fields[9];
		if (!timeStr || !dateStr || timeStr.length < 6 || dateStr.length < 6) {
			return null;
		}

		const hh = parseInt(timeStr.slice(0, 2), 10);
		const mm = parseInt(timeStr.slice(2, 4), 10);
		const ss = parseInt(timeStr.slice(4, 6), 10);
		const dd = parseInt(dateStr.slice(0, 2), 10);
		const mo = parseInt(dateStr.slice(2, 4), 10);
		const yy = parseInt(dateStr.slice(4, 6), 10);

		const timestamp = Date.UTC(2000 + yy, mo - 1, dd, hh, mm, ss);

		if (
			Number.isNaN(lat) ||
			Number.isNaN(lon) ||
			Number.isNaN(speed) ||
			Number.isNaN(heading) ||
			Number.isNaN(timestamp)
		) {
			return null;
		}

		return {
			lat,
			lon,
			speed: Math.round(speed * 100) / 100,
			heading,
			timestamp,
		};
	} catch {
		return null;
	}
}
