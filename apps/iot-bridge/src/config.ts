import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ path: ".env.local" });

class ConfigError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ConfigError";
	}
}

const ConfigSchema = z.object({
	MQTT_URL: z.string().min(1),
	VEHICLE_CALLSIGN: z.string().min(1),
	LOCATION_SOURCE: z.enum(["simulate", "gps", "wifi"]).default("simulate"),
	SERIAL_PORT: z.string().default("/dev/ttyUSB1"),
	BAUD_RATE: z.coerce.number().default(115200),
	SIMULATE_LAT: z.coerce.number().default(25.7617),
	SIMULATE_LON: z.coerce.number().default(-80.1918),
	ROUTE_FILE: z.string().optional(),
	BATTERY_PCT: z.coerce.number().min(0).max(100).optional(),
	GOOGLE_GEOLOCATION_API_KEY: z.string().optional(),
	WIFI_INTERFACE: z.string().default("wlan0"),
	WIFI_SCAN_INTERVAL_MS: z.coerce.number().int().positive().default(15000),
});

export type Config = z.infer<typeof ConfigSchema>;

export function parseConfig(): Config {
	const result = ConfigSchema.safeParse(process.env);
	if (!result.success) {
		const formatted = result.error.format();
		throw new ConfigError(
			`Invalid environment variables: ${JSON.stringify(formatted)}`,
		);
	}
	return result.data;
}
