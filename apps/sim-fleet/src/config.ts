import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ path: ".env.local" });

export class ConfigError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ConfigError";
	}
}

const ConfigSchema = z.object({
	MQTT_URL: z.string().default("mqtt://localhost:1883"),
	BACKEND_URL: z.string().default("http://localhost:3001"),
	FLEET_CONFIG: z.string().optional(),
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
