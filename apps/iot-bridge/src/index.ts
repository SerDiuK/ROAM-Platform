import mqtt from "mqtt";
import pino from "pino";
import { parseConfig } from "./config.js";
import type { GpsFix } from "./nmea.js";
import { startSimulator } from "./simulator.js";

async function main(): Promise<void> {
	const config = parseConfig();
	const logger = pino({ name: config.VEHICLE_CALLSIGN });
	const topic = `vehicles/${config.VEHICLE_CALLSIGN}/telemetry`;

	const client = mqtt.connect(config.MQTT_URL, { reconnectPeriod: 3000 });

	client.on("connect", () => {
		logger.info("MQTT connected");
	});

	client.on("error", (err: Error) => {
		logger.error(err, "MQTT error");
	});

	function handleFix(fix: GpsFix): void {
		const payload = {
			callsign: config.VEHICLE_CALLSIGN,
			lat: fix.lat,
			lon: fix.lon,
			speed: fix.speed,
			heading: fix.heading,
			timestamp: fix.timestamp,
			...(config.BATTERY_PCT != null && { batteryPct: config.BATTERY_PCT }),
		};

		client.publish(topic, JSON.stringify(payload));
		logger.info(`Published fix: ${fix.lat},${fix.lon} @ ${fix.speed}km/h`);
	}

	switch (config.LOCATION_SOURCE) {
		case "simulate":
			startSimulator(config.VEHICLE_CALLSIGN, handleFix);
			break;
		case "gps": {
			// Dynamic import so serialport native bindings aren't loaded in non-GPS modes
			const { startGps } = await import("./gps.js");
			startGps(handleFix);
			break;
		}
		case "wifi": {
			const { startWifiLocation } = await import("./wifi-location.js");
			startWifiLocation(config.VEHICLE_CALLSIGN, handleFix);
			break;
		}
	}
}

main().catch((err: unknown) => {
	console.error("Fatal error:", err);
	process.exit(1);
});
