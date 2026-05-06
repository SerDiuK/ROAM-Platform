import { defineConfig } from "vitest/config";
import path from "node:path";

// Mobile vitest scope: pure logic only. The push.ts module imports `react-native`
// transitively (via its api dep), so we keep the include narrow and rely on
// vi.mock to stub all native-only imports — no Metro / react-native runtime is
// loaded under test.
export default defineConfig({
	test: {
		environment: "node",
		globals: false,
		include: ["src/**/*.spec.ts"],
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "src"),
		},
	},
});
