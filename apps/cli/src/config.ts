import { z } from "zod";

class ConfigError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ConfigError";
	}
}

const ConfigSchema = z.object({
	ROAM_BACKEND_URL: z.string().url().default("http://localhost:3001"),
	MONGODB_URL: z
		.string()
		.min(1)
		.default("mongodb://localhost:27018/roam?directConnection=true"),
});

type Config = z.infer<typeof ConfigSchema>;

function parseConfig(): Config {
	const result = ConfigSchema.safeParse(process.env);
	if (!result.success) {
		throw new ConfigError(
			`Invalid environment variables: ${JSON.stringify(result.error.format())}`,
		);
	}
	return result.data;
}

export const config = parseConfig();
