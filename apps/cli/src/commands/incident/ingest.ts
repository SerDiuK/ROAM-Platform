import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Args, Flags } from "@oclif/core";
import type { Briefing } from "@roam/shared";
import chalk from "chalk";
import ora from "ora";
import { BaseCommand } from "../../base-command.js";
import { shortId } from "../../lib/format.js";

// src/ and build/ both sit five levels below the repo root.
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../../../..");
const DEFAULT_AUDIO = resolve(REPO_ROOT, "apps/dashboard/public/911call.wav");

const MIME_BY_EXT: Record<string, string> = {
	".wav": "audio/wav",
	".mp3": "audio/mpeg",
	".m4a": "audio/mp4",
	".aac": "audio/aac",
	".ogg": "audio/ogg",
	".webm": "audio/webm",
	".flac": "audio/flac",
};

function mimeFromExt(filePath: string): string | null {
	return MIME_BY_EXT[extname(filePath).toLowerCase()] ?? null;
}

function truncate(s: string, n: number): string {
	return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function errorCode(err: Error): string | undefined {
	return "code" in err && typeof err.code === "string" ? err.code : undefined;
}

function describeError(err: unknown): { headline: string; details: string[] } {
	const lines: string[] = [];
	let current: unknown = err;
	for (let depth = 0; depth < 5 && current; depth += 1) {
		if (!(current instanceof Error)) {
			lines.push(String(current));
			break;
		}
		lines.push(`${errorCode(current) ?? ""} ${current.message}`.trim());
		current = current.cause;
	}
	return { headline: lines[0] ?? "unknown error", details: lines.slice(1) };
}

const TRANSIENT_CODES = new Set([
	"ECONNREFUSED",
	"ECONNRESET",
	"EPIPE",
	"ETIMEDOUT",
	"UND_ERR_SOCKET",
]);

function isTransientFetchError(err: unknown): boolean {
	let current: unknown = err;
	for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
		const code = errorCode(current);
		if (code && TRANSIENT_CODES.has(code)) return true;
		current = current.cause;
	}
	return false;
}

export default class IncidentIngest extends BaseCommand {
	static override summary =
		"Ingest a 911 call (audio or transcript) and watch the dashboard pick it up.";
	static override description =
		"Reads an audio file, base64-encodes it, and POSTs to /api/incidents/ingest. The backend transcribes via Deepgram and runs the briefing agent — the dashboard's right sidebar will show the new incident as soon as it's persisted, then fill in the briefing when the agent is done. Default audio is apps/dashboard/public/911call.wav.";

	static override examples = [
		"<%= config.bin %> incident ingest",
		"<%= config.bin %> incident ingest ./call.wav",
		"<%= config.bin %> incident ingest --transcript 'Multi-vehicle crash at Biscayne & 36th'",
		"<%= config.bin %> incident ingest ./call.mp3 --no-wait",
	];

	static override args = {
		audio: Args.string({
			description: `Path to the audio file (default: apps/dashboard/public/${basename(DEFAULT_AUDIO)}).`,
		}),
	};

	static override flags = {
		transcript: Flags.string({
			description:
				"Skip audio and pass a raw transcript string. Mutually exclusive with the audio arg.",
		}),
		"mime-type": Flags.string({
			description: "Override the inferred mime type (e.g. audio/wav).",
		}),
		"no-wait": Flags.boolean({
			description:
				"Return as soon as the incident is created; don't poll for the briefing.",
			default: false,
		}),
		timeout: Flags.integer({
			description: "Seconds to wait for the briefing before giving up.",
			default: 180,
		}),
	};

	async run(): Promise<void> {
		const { args, flags } = await this.parse(IncidentIngest);

		if (flags.transcript && args.audio) {
			this.error(
				chalk.red("Pass either an audio path or --transcript, not both."),
			);
		}

		const spinner = ora();
		const payload = await this.buildPayload(args.audio, flags, spinner);

		spinner.start("Ingesting (transcribing + dispatching agent)");
		try {
			const incident = await this.api.incidents.ingest(payload);
			spinner.succeed(
				`Incident created · ${chalk.cyan(shortId(incident._id))}`,
			);

			this.log("");
			this.log(chalk.bold("Incident"));
			this.log(`  id           ${incident._id}`);
			this.log(`  status       ${incident.status}`);
			this.log(
				`  startedAt    ${new Date(incident.callStartedAt).toISOString()}`,
			);
			this.log(`  transcript   ${truncate(incident.transcript, 120)}`);
			this.log("");
			this.log(
				chalk.dim(
					"Dashboard: incident appears in the right sidebar; the briefing follows when the agent finishes",
				),
			);

			if (flags["no-wait"]) return;

			spinner.start(`Waiting for briefing (timeout ${flags.timeout}s)`);
			const briefing = await this.waitForBriefing(
				incident._id,
				flags.timeout * 1000,
			);
			if (!briefing) {
				spinner.warn(
					"Briefing not ready in time — agent may still be running. Re-run with --no-wait or increase --timeout.",
				);
				return;
			}
			spinner.succeed(`Briefing ready · ${chalk.cyan(shortId(briefing._id))}`);
			this.log("");
			this.log(chalk.bold("Briefing summary"));
			this.log(`  ${briefing.summary}`);
			this.log(
				`  units       ${briefing.recommendedResponderIds.length} responders · ${briefing.recommendedVehicleIds.length} vehicles`,
			);
			this.log("");
			this.log(chalk.dim("Next:"));
			this.log(
				chalk.dim(
					"  Confirm via the dashboard → creates a Dispatch and notifies recommended responders",
				),
			);
		} catch (err) {
			const { headline, details } = describeError(err);
			spinner.fail(chalk.red(headline));
			for (const line of details) {
				this.log(chalk.dim(`  ↳ ${line}`));
			}
			if (isTransientFetchError(err)) {
				this.log(
					chalk.dim(
						`  Backend at ${this.backend} appears down or restarting. Check the @roam/backend dev terminal — tsx watch usually restarts within a second of an edit.`,
					),
				);
			}
			this.exit(1);
		}
	}

	private async buildPayload(
		audioArg: string | undefined,
		flags: { transcript?: string; "mime-type"?: string },
		spinner: ReturnType<typeof ora>,
	): Promise<{ transcript: string } | { audio: string; mimeType: string }> {
		if (flags.transcript) {
			spinner.succeed(`Using transcript (${flags.transcript.length} chars)`);
			return { transcript: flags.transcript };
		}

		const audioPath = audioArg
			? resolve(process.cwd(), audioArg)
			: DEFAULT_AUDIO;
		if (!existsSync(audioPath)) {
			this.error(chalk.red(`Audio file not found: ${audioPath}`));
		}
		const mimeType = flags["mime-type"] ?? mimeFromExt(audioPath);
		if (!mimeType) {
			this.error(
				chalk.red(
					`Unknown audio extension "${extname(audioPath)}". Pass --mime-type to override.`,
				),
			);
		}

		spinner.start(`Reading ${audioPath}`);
		const buffer = await readFile(audioPath);
		spinner.succeed(
			`Loaded ${(buffer.byteLength / 1024).toFixed(1)} KiB · ${mimeType}`,
		);
		return { audio: buffer.toString("base64"), mimeType };
	}

	private async waitForBriefing(
		incidentId: string,
		timeoutMs: number,
	): Promise<Briefing | null> {
		const startedAt = Date.now();
		const POLL_MS = 1500;
		while (Date.now() - startedAt < timeoutMs) {
			const result = await this.api.incidents.get({ id: incidentId });
			if (result.briefing) return result.briefing;
			await new Promise((r) => setTimeout(r, POLL_MS));
		}
		return null;
	}
}
