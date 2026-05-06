import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		setupFiles: ["./test/setup.ts"],
		testTimeout: 30_000,
		hookTimeout: 60_000,
		globals: false,
		include: ["src/**/*.spec.ts", "test/**/*.spec.ts"],
	},
});
