import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pino from "pino";
import { z } from "zod";
import { parseConfig } from "./config.js";
import type { GpsFix } from "./nmea.js";

const logger = pino({ name: "simulator" });

const RouteSchema = z
	.array(z.object({ lat: z.number(), lon: z.number(), holdMs: z.number() }))
	.min(2, "Route file must contain at least 2 waypoints");

const EARTH_RADIUS_M = 6_371_000;

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

function startRouteMode(
	callsign: string,
	routeFile: string,
	onFix: (fix: GpsFix) => void,
): void {
	const waypoints = RouteSchema.parse(
		JSON.parse(readFileSync(resolve(routeFile), "utf-8")),
	);

	let currentIdx = 0;
	let nextIdx = 1;
	let progress = 0;
	let dwellRemaining = 0;
	let lastLat = waypoints[0].lat;
	let lastLon = waypoints[0].lon;

	const TARGET_SPEED_MPS = 8.33;
	const TICK_MS = 1000;

	const interval = setInterval(() => {
		const now = Date.now();

		if (dwellRemaining > 0) {
			dwellRemaining -= TICK_MS;
			const fix: GpsFix = {
				lat: waypoints[currentIdx].lat,
				lon: waypoints[currentIdx].lon,
				speed: 0,
				heading: bearing(
					waypoints[currentIdx].lat,
					waypoints[currentIdx].lon,
					waypoints[nextIdx].lat,
					waypoints[nextIdx].lon,
				),
				timestamp: now,
			};
			onFix(fix);
			logFix(callsign, fix);
			return;
		}

		const from = waypoints[currentIdx];
		const to = waypoints[nextIdx];
		const segmentDist = haversineDistance(from.lat, from.lon, to.lat, to.lon);
		const progressStep = segmentDist > 0 ? TARGET_SPEED_MPS / segmentDist : 1;
		progress += progressStep;

		if (progress >= 1) {
			lastLat = to.lat;
			lastLon = to.lon;
			dwellRemaining = to.holdMs;
			currentIdx = nextIdx;
			nextIdx = (nextIdx + 1) % waypoints.length;
			progress = 0;

			const fix: GpsFix = {
				lat: to.lat,
				lon: to.lon,
				speed: 0,
				heading: bearing(
					to.lat,
					to.lon,
					waypoints[nextIdx].lat,
					waypoints[nextIdx].lon,
				),
				timestamp: now,
			};
			onFix(fix);
			logFix(callsign, fix);
			return;
		}

		const lat = from.lat + progress * (to.lat - from.lat);
		const lon = from.lon + progress * (to.lon - from.lon);

		const distFromLast = haversineDistance(lastLat, lastLon, lat, lon);
		const speedMs = distFromLast / (TICK_MS / 1000);
		const speedKmh = Math.round(speedMs * 3.6 * 100) / 100;
		const hdg = bearing(lastLat, lastLon, lat, lon);

		lastLat = lat;
		lastLon = lon;

		const fix: GpsFix = {
			lat: Math.round(lat * 1_000_000) / 1_000_000,
			lon: Math.round(lon * 1_000_000) / 1_000_000,
			speed: speedKmh,
			heading: Math.round(hdg * 100) / 100,
			timestamp: now,
		};
		onFix(fix);
		logFix(callsign, fix);
	}, TICK_MS);

	process.on("SIGINT", () => clearInterval(interval));
	process.on("SIGTERM", () => clearInterval(interval));
}

function startRandomWalk(
	callsign: string,
	startLat: number,
	startLon: number,
	onFix: (fix: GpsFix) => void,
): void {
	let lat = startLat;
	let lon = startLon;
	let heading = Math.random() * 360;
	let speed = 20;

	const TICK_MS = 2000;

	const interval = setInterval(() => {
		lat += (Math.random() - 0.5) * 0.0002;
		lon += (Math.random() - 0.5) * 0.0002;
		speed = Math.max(5, Math.min(35, speed + (Math.random() - 0.5) * 10));
		heading = (heading + (Math.random() - 0.5) * 10 + 360) % 360;

		const fix: GpsFix = {
			lat: Math.round(lat * 1_000_000) / 1_000_000,
			lon: Math.round(lon * 1_000_000) / 1_000_000,
			speed: Math.round(speed * 100) / 100,
			heading: Math.round(heading * 100) / 100,
			timestamp: Date.now(),
		};
		onFix(fix);
		logFix(callsign, fix);
	}, TICK_MS);

	process.on("SIGINT", () => clearInterval(interval));
	process.on("SIGTERM", () => clearInterval(interval));
}

function logFix(callsign: string, fix: GpsFix): void {
	logger.info(
		`[${callsign}] SIM fix: lat=${fix.lat} lon=${fix.lon} @ ${fix.speed}km/h`,
	);
}

export function startSimulator(
	callsign: string,
	onFix: (fix: GpsFix) => void,
): void {
	const config = parseConfig();

	if (config.ROUTE_FILE) {
		logger.info(`[${callsign}] Starting route-file mode: ${config.ROUTE_FILE}`);
		startRouteMode(callsign, config.ROUTE_FILE, onFix);
	} else {
		logger.info(
			`[${callsign}] Starting random-walk mode at ${config.SIMULATE_LAT},${config.SIMULATE_LON}`,
		);
		startRandomWalk(callsign, config.SIMULATE_LAT, config.SIMULATE_LON, onFix);
	}
}
