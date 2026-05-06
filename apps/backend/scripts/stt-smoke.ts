import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseConfig } from "../src/config.js";
import { createTranscriber } from "../src/agent/transcribe.js";

// Smoke test for the Deepgram file-transcription path. Reads a wav file
// (default: test/fixtures/sample-call.wav) and prints transcript + confidence
// so we can verify Nova-3 returns a usable result against a real API key.
//
// Run with:
//   pnpm --filter @roam/backend stt:smoke
//   STT_SMOKE_FIXTURE=/path/to/other.wav pnpm --filter @roam/backend stt:smoke
//
// Acceptance: confidence > 0.8 and a non-empty transcript.

const DEFAULT_FIXTURE_PATH = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../test/fixtures/sample-call.wav",
);
const FIXTURE_PATH = process.env.STT_SMOKE_FIXTURE
	? path.resolve(process.env.STT_SMOKE_FIXTURE)
	: DEFAULT_FIXTURE_PATH;
const EXPECTED =
	FIXTURE_PATH === DEFAULT_FIXTURE_PATH
		? "There's a hazmat spill at 4th and Main, two casualties, smoke visible."
		: null;

async function main(): Promise<void> {
	const config = parseConfig();
	if (config.STT_PROVIDER !== "deepgram") {
		throw new Error(
			`stt-smoke only supports STT_PROVIDER=deepgram (got ${config.STT_PROVIDER})`,
		);
	}

	const audio = await readFile(FIXTURE_PATH);
	console.log(
		`[stt-smoke] read ${audio.byteLength} bytes from ${FIXTURE_PATH}`,
	);

	const transcriber = createTranscriber({ apiKey: config.DEEPGRAM_API_KEY });
	const start = Date.now();
	const result = await transcriber.transcribeAudioFile(audio, "audio/wav");
	const elapsed = Date.now() - start;

	console.log(`[stt-smoke] elapsed=${elapsed}ms`);
	console.log(`[stt-smoke] confidence=${result.confidence}`);
	console.log(`[stt-smoke] transcript=${JSON.stringify(result.transcript)}`);
	if (EXPECTED !== null) {
		console.log(`[stt-smoke] expected  =${JSON.stringify(EXPECTED)}`);
	}

	if (result.utterances.length > 0) {
		console.log(`[stt-smoke] conversation (${result.utterances.length} utterances):`);
		for (const u of result.utterances) {
			const ts = `${u.start.toFixed(2)}s`.padStart(7);
			console.log(`  ${ts}  Speaker ${u.speaker}: ${u.transcript}`);
		}
	} else {
		console.log("[stt-smoke] no utterances returned");
	}

	if (!(result.confidence > 0.8)) {
		throw new Error(
			`confidence ${result.confidence} is not > 0.8 — fixture or model regressed`,
		);
	}
	if (result.transcript.trim().length === 0) {
		throw new Error("transcript is empty");
	}

	console.log("[stt-smoke] OK");
}

main().catch((err: unknown) => {
	console.error("[stt-smoke] failed:", err);
	process.exit(1);
});
