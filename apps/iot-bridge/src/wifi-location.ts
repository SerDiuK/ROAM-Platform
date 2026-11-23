import { spawn } from "node:child_process";
import pino from "pino";
import { z } from "zod";
import { parseConfig } from "./config.js";
import type { GpsFix } from "./nmea.js";

const logger = pino({ name: "wifi-location" });
const EARTH_RADIUS_M = 6_371_000;

interface WifiAp {
	macAddress: string;
	signalStrength: number;
	channel?: number;
}

const GeolocationResponseSchema = z.object({
	location: z.object({ lat: z.number(), lng: z.number() }),
	accuracy: z.number(),
});

function toRad(deg: number): number {
	return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
	return (rad * 180) / Math.PI;
}

function haversineDistance(
	lat1: number,
	lon1: number,
	lat2: number,
	lon2: number,
): number {
	const dLat = toRad(lat2 - lat1);
	const dLon = toRad(lon2 - lon1);
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
	return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearing(
	lat1: number,
	lon1: number,
	lat2: number,
	lon2: number,
): number {
	const dLon = toRad(lon2 - lon1);
	const y = Math.sin(dLon) * Math.cos(toRad(lat2));
	const x =
		Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
		Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
	return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

async function scanWifi(iface: string): Promise<WifiAp[]> {
	const stdout = await new Promise<string>((resolve, reject) => {
		const proc = spawn("sudo", ["-n", "/usr/sbin/iw", "dev", iface, "scan"]);
		let out = "";
		let err = "";
		proc.stdout.on("data", (d: Buffer) => {
			out += d.toString();
		});
		proc.stderr.on("data", (d: Buffer) => {
			err += d.toString();
		});
		proc.on("error", (e) => reject(e));
		proc.on("close", (code) => {
			if (code !== 0) {
				reject(
					new Error(`iw scan exited ${code}: ${err.trim().slice(0, 200)}`),
				);
				return;
			}
			resolve(out);
		});
	});
	return parseIwScan(stdout);
}

function pushComplete(aps: WifiAp[], ap: Partial<WifiAp>): void {
	if (ap.macAddress && ap.signalStrength != null) {
		aps.push({
			macAddress: ap.macAddress,
			signalStrength: ap.signalStrength,
			channel: ap.channel,
		});
	}
}

function parseIwScan(output: string): WifiAp[] {
	const aps: WifiAp[] = [];
	let current: Partial<WifiAp> | null = null;
	const bssRe = /^BSS\s+([0-9a-fA-F:]{17})/;
	const signalRe = /^\s+signal:\s+(-?[\d.]+)\s+dBm/;
	const channelRe =
		/^\s+(?:DS Parameter set: channel|\*\s+primary channel:)\s+(\d+)/;

	for (const line of output.split("\n")) {
		const bssMatch = bssRe.exec(line);
		if (bssMatch) {
			if (current) pushComplete(aps, current);
			current = { macAddress: bssMatch[1].toUpperCase() };
			continue;
		}
		if (!current) continue;

		const signalMatch = signalRe.exec(line);
		if (signalMatch) {
			current.signalStrength = Math.round(Number(signalMatch[1]));
			continue;
		}

		const channelMatch = channelRe.exec(line);
		if (channelMatch) {
			current.channel = Number(channelMatch[1]);
		}
	}

	if (current) pushComplete(aps, current);
	return aps;
}

async function locateFromAps(
	apiKey: string,
	aps: WifiAp[],
): Promise<{ lat: number; lon: number; accuracy: number }> {
	const url = `https://www.googleapis.com/geolocation/v1/geolocate?key=${encodeURIComponent(
		apiKey,
	)}`;
	const res = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			considerIp: false,
			wifiAccessPoints: aps.map((a) => ({
				macAddress: a.macAddress,
				signalStrength: a.signalStrength,
				...(a.channel != null && { channel: a.channel }),
			})),
		}),
	});

	if (!res.ok) {
		const body = await res.text();
		throw new Error(`Geolocation API ${res.status}: ${body.slice(0, 200)}`);
	}

	const data = GeolocationResponseSchema.parse(await res.json());
	return {
		lat: data.location.lat,
		lon: data.location.lng,
		accuracy: data.accuracy,
	};
}

export function startWifiLocation(
	callsign: string,
	onFix: (fix: GpsFix) => void,
): void {
	const config = parseConfig();
	if (!config.GOOGLE_GEOLOCATION_API_KEY) {
		throw new Error(
			"GOOGLE_GEOLOCATION_API_KEY is required when LOCATION_SOURCE=wifi",
		);
	}
	const apiKey = config.GOOGLE_GEOLOCATION_API_KEY;
	const iface = config.WIFI_INTERFACE;
	const intervalMs = config.WIFI_SCAN_INTERVAL_MS;

	logger.info(
		`[${callsign}] WiFi-location mode (iface=${iface}, every ${intervalMs}ms)`,
	);

	let lastLat: number | null = null;
	let lastLon: number | null = null;
	let lastTime: number | null = null;
	let running = false;

	async function tick(): Promise<void> {
		// Skip overlapping ticks — a single iw scan can take 3–5s.
		if (running) return;
		running = true;
		try {
			const aps = await scanWifi(iface);
			if (aps.length < 2) {
				logger.warn(
					`Only ${aps.length} APs in scan — Google requires ≥2 for a fix`,
				);
				return;
			}
			const loc = await locateFromAps(apiKey, aps);
			const now = Date.now();
			let speed = 0;
			let heading = 0;
			if (lastLat != null && lastLon != null && lastTime != null) {
				const dt = (now - lastTime) / 1000;
				if (dt > 0) {
					const dist = haversineDistance(lastLat, lastLon, loc.lat, loc.lon);
					speed = Math.round((dist / dt) * 3.6 * 100) / 100;
					heading =
						Math.round(bearing(lastLat, lastLon, loc.lat, loc.lon) * 100) / 100;
				}
			}
			lastLat = loc.lat;
			lastLon = loc.lon;
			lastTime = now;

			const fix: GpsFix = {
				lat: loc.lat,
				lon: loc.lon,
				speed,
				heading,
				timestamp: now,
			};
			onFix(fix);
			logger.info(
				`[${callsign}] WiFi fix: lat=${fix.lat} lon=${fix.lon} accuracy=${loc.accuracy}m (${aps.length} APs)`,
			);
		} catch (err) {
			logger.error(err, "WiFi location error");
		} finally {
			running = false;
		}
	}

	tick();
	const interval = setInterval(tick, intervalMs);
	process.on("SIGINT", () => clearInterval(interval));
	process.on("SIGTERM", () => clearInterval(interval));
}
