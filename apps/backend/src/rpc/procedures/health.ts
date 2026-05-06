import { os } from "../builder.js";

export const healthRouter = {
	check: os.health.check.handler(() => ({
		status: "ok" as const,
		timestamp: new Date(),
	})),
};
