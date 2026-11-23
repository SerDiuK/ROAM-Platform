import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// Ink patches the console with `new console.Console`, which vitest's own console lacks.
		disableConsoleIntercept: true,
	},
});
