import { ReadlineParser } from "@serialport/parser-readline";
import pino from "pino";
import { SerialPort } from "serialport";
import { parseConfig } from "./config.js";
import { type GpsFix, parseNmea } from "./nmea.js";

const logger = pino({ name: "gps" });
const RECONNECT_DELAY_MS = 5000;
const READY_TIMEOUT_MS = 30_000;

// SIM7670G AT init sequence. Re-runs are tolerated (chip will return ERROR if
// already configured, which we ignore). After CGNSSTST=1, NMEA streams on the
// same UART used for AT, so the line parser handles both.
const PRE_READY_COMMANDS = ["AT", "ATE0", "AT+CGNSSPWR=1"];
const POST_READY_COMMANDS = ["AT+CGNSSPORTSWITCH=0,1", "AT+CGNSSTST=1"];

export function startGps(onFix: (fix: GpsFix) => void): void {
	const config = parseConfig();

	logger.info(
		`Opening serial port ${config.SERIAL_PORT} at ${config.BAUD_RATE} baud`,
	);

	const port = new SerialPort({
		path: config.SERIAL_PORT,
		baudRate: config.BAUD_RATE,
	});

	const parser = port.pipe(new ReadlineParser({ delimiter: "\r\n" }));

	parser.on("data", (rawLine: string) => {
		const line = rawLine.trim();
		if (!line) return;

		if (line.startsWith("$")) {
			const fix = parseNmea(line);
			if (fix) onFix(fix);
			return;
		}

		// AT responses / URCs — log but don't act on them. URC handling
		// (CGNSSPWR: READY!) is done inside initSim7670g via timed waits.
		logger.debug({ line }, "AT");
	});

	port.on("open", () => {
		void initSim7670g(port).catch((err: unknown) => {
			logger.error(err, "SIM7670G init failed — closing port to retry");
			port.close();
		});
	});

	port.on("error", (err: Error) => {
		logger.error(err, "Serial port error — retrying in 5s");
		port.close(() => {
			setTimeout(() => startGps(onFix), RECONNECT_DELAY_MS);
		});
	});

	port.on("close", () => {
		logger.warn("Serial port closed — retrying in 5s");
		setTimeout(() => startGps(onFix), RECONNECT_DELAY_MS);
	});
}

async function initSim7670g(port: SerialPort): Promise<void> {
	for (const cmd of PRE_READY_COMMANDS) {
		logger.info(`SIM7670G init → ${cmd}`);
		port.write(`${cmd}\r\n`);
		await sleep(500);
	}

	// Wait for +CGNSSPWR: READY! URC, but don't fail if it doesn't come — on
	// re-runs the GNSS subsystem is already up and the URC won't fire.
	logger.info(`Waiting up to ${READY_TIMEOUT_MS / 1000}s for GNSS subsystem`);
	await sleep(READY_TIMEOUT_MS / 4);

	for (const cmd of POST_READY_COMMANDS) {
		logger.info(`SIM7670G init → ${cmd}`);
		port.write(`${cmd}\r\n`);
		await sleep(500);
	}
	logger.info("SIM7670G init complete — NMEA stream should follow");
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
