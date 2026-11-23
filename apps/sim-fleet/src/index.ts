import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { type ApiClient, createApiClient } from "@roam/api";
import pino from "pino";
import { childProcessEnv, parseConfig } from "./config.js";
import { loadFleet } from "./fleet.js";
import { endStaleFleetSessions, lookupFleet } from "./seed.js";

const logger = pino({ name: "sim-fleet" });

const __dirname = dirname(fileURLToPath(import.meta.url));
const MONOREPO_ROOT = resolve(__dirname, "..", "..", "..");
const IOT_BRIDGE_DIR = resolve(MONOREPO_ROOT, "apps", "iot-bridge");
const IOT_BRIDGE_ENTRY = resolve(IOT_BRIDGE_DIR, "src", "index.ts");
const IOT_BRIDGE_ROUTES = resolve(IOT_BRIDGE_DIR, "routes");

function resolveTsx(): string {
	const localTsx = resolve(IOT_BRIDGE_DIR, "node_modules", ".bin", "tsx");
	if (existsSync(localTsx)) return localTsx;

	const rootTsx = resolve(MONOREPO_ROOT, "node_modules", ".bin", "tsx");
	if (existsSync(rootTsx)) return rootTsx;

	throw new Error("tsx binary not found — run pnpm install");
}

function prefixStream(stream: NodeJS.ReadableStream, prefix: string): void {
	const rl = createInterface({ input: stream });
	rl.on("line", (line: string) => {
		process.stdout.write(`[${prefix}] ${line}\n`);
	});
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function killProcessGroup(
	child: ChildProcess,
	signal: NodeJS.Signals,
): boolean {
	if (child.pid != null) {
		try {
			process.kill(-child.pid, signal);
			return true;
		} catch (err: unknown) {
			logger.debug({ err }, `Process group ${child.pid} already exited`);
			return false;
		}
	}
	return child.kill(signal);
}

async function autoCheckin(
	api: ApiClient,
	callsign: string,
	vehicleId: string,
	responderName: string,
	checkedIn: Set<string>,
): Promise<void> {
	const MAX_RETRIES = 3;
	const RETRY_DELAY_MS = 2000;

	for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
		try {
			await api.auth.checkin({ vehicleId, responderName });
			checkedIn.add(vehicleId);
			logger.info(
				`Auto-checkin OK for ${callsign} as ${responderName} (vehicle ${vehicleId})`,
			);
			return;
		} catch (err: unknown) {
			logger.warn(
				`Auto-checkin attempt ${attempt}/${MAX_RETRIES} error for ${callsign}: ${err}`,
			);
		}
		if (attempt < MAX_RETRIES) {
			await delay(RETRY_DELAY_MS);
		}
	}
	logger.error(
		`Auto-checkin failed for ${callsign} after ${MAX_RETRIES} attempts`,
	);
}

async function main(): Promise<void> {
	const config = parseConfig();
	const fleet = loadFleet(config.FLEET_CONFIG);
	const tsxBin = resolveTsx();
	const api = createApiClient(config.BACKEND_URL);

	logger.info(`Resolving ${fleet.length} fleet vehicles from backend...`);
	const vehicles = await api.vehicles.list();
	const callsignToVehicleId = lookupFleet(vehicles, fleet);
	await endStaleFleetSessions(api, vehicles, callsignToVehicleId);

	const children = new Map<string, ChildProcess>();
	const checkedInVehicleIds = new Set<string>();

	for (const vehicle of fleet) {
		if (vehicle.seedTelemetry) {
			logger.info(`Skipping bridge for static vehicle ${vehicle.callsign}`);
			continue;
		}

		const routeFile = resolve(IOT_BRIDGE_ROUTES, vehicle.routeFile);
		if (!existsSync(routeFile)) {
			logger.error(`Route file not found: ${routeFile}`);
			continue;
		}

		const child = spawn(tsxBin, [IOT_BRIDGE_ENTRY], {
			cwd: IOT_BRIDGE_DIR,
			detached: true,
			env: childProcessEnv({
				VEHICLE_CALLSIGN: vehicle.callsign,
				MQTT_URL: config.MQTT_URL,
				LOCATION_SOURCE: "simulate",
				ROUTE_FILE: routeFile,
				...(vehicle.batteryPct != null && {
					BATTERY_PCT: String(vehicle.batteryPct),
				}),
			}),
			stdio: ["ignore", "pipe", "pipe"],
		});

		if (child.stdout) prefixStream(child.stdout, vehicle.callsign);
		if (child.stderr) prefixStream(child.stderr, vehicle.callsign);

		child.on("exit", (code: number | null) => {
			logger.warn(`${vehicle.callsign} exited with code ${code}`);
			children.delete(vehicle.callsign);
		});

		children.set(vehicle.callsign, child);
		logger.info(`Spawned ${vehicle.callsign} → ${vehicle.routeFile}`);
	}

	for (const vehicle of fleet) {
		if (!vehicle.autoCheckin) continue;
		const vehicleId = callsignToVehicleId.get(vehicle.callsign);
		if (!vehicleId) {
			logger.warn(
				`Skipping auto-checkin for ${vehicle.callsign} — seed did not return an id`,
			);
			continue;
		}
		setTimeout(() => {
			autoCheckin(
				api,
				vehicle.callsign,
				vehicleId,
				vehicle.responderName,
				checkedInVehicleIds,
			);
		}, 3000);
	}

	logger.info(`Fleet started: ${children.size} vehicles`);

	async function checkoutAll(): Promise<void> {
		const ids = [...checkedInVehicleIds];
		if (ids.length === 0) return;

		logger.info(`Checking out ${ids.length} active vehicles...`);
		await Promise.allSettled(
			ids.map(async (vehicleId) => {
				try {
					await api.auth.checkout({ vehicleId });
					logger.info(`Checkout OK for vehicle ${vehicleId}`);
				} catch (err: unknown) {
					logger.warn(`Checkout error for ${vehicleId}: ${err}`);
				}
			}),
		);
		checkedInVehicleIds.clear();
	}

	function shutdown(): void {
		logger.info("Shutting down fleet...");

		checkoutAll().finally(() => {
			for (const [id, child] of children) {
				logger.info(`Sending SIGTERM to ${id}`);
				killProcessGroup(child, "SIGTERM");
			}

			const killTimer = setTimeout(() => {
				for (const [id, child] of children) {
					logger.warn(`Force-killing ${id}`);
					killProcessGroup(child, "SIGKILL");
				}
				process.exit(1);
			}, 5000);
			killTimer.unref();

			const checkInterval = setInterval(() => {
				if (children.size === 0) {
					clearInterval(checkInterval);
					clearTimeout(killTimer);
					logger.info("All vehicles stopped");
					process.exit(0);
				}
			}, 200);
		});
	}

	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);
}

main().catch((err: unknown) => {
	logger.error(err, "Fatal error");
	process.exit(1);
});
