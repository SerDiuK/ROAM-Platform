const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("node:path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
	path.resolve(projectRoot, "node_modules"),
	path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.unstable_enableSymlinks = true;
config.resolver.unstable_enablePackageExports = true;

// Force singletons for React + RN runtime. Without this, pnpm's per-package
// symlinks (e.g. packages/api/node_modules/react) can be registered by Metro
// as separate module instances, producing two ReactCurrentDispatcher refs and
// "Invalid hook call" at runtime.
const SINGLETONS = new Set([
	"react",
	"react-dom",
	"react-native",
	"react-native-web",
]);
const previousResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
	if (SINGLETONS.has(moduleName)) {
		return context.resolveRequest(
			{ ...context, originModulePath: path.join(projectRoot, "noop.js") },
			moduleName,
			platform,
		);
	}
	if (previousResolveRequest) {
		return previousResolveRequest(context, moduleName, platform);
	}
	return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, {
	input: "./global.css",
	inlineRem: 16,
});
