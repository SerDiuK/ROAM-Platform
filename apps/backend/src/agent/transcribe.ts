import type { Readable } from "node:stream";
import { DeepgramClient, DeepgramError } from "@deepgram/sdk";

const STT_MODEL = "nova-3";

export class TranscribeError extends Error {
	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = "TranscribeError";
	}
}

export interface TranscribeUtterance {
	speaker: number;
	transcript: string;
	start: number;
	end: number;
	confidence: number;
}

export interface TranscribeResult {
	transcript: string;
	confidence: number;
	utterances: TranscribeUtterance[];
}

export interface TranscriberConfig {
	apiKey: string;
}

export interface Transcriber {
	transcribeAudioFile(
		audioBuffer: Buffer,
		mimeType: string,
	): Promise<TranscribeResult>;
	transcribeAudioStream(
		audioStream: Readable,
		onPartial: (text: string) => void,
	): Promise<string>;
}

export function createTranscriber(config: TranscriberConfig): Transcriber {
	const client = new DeepgramClient({ apiKey: config.apiKey });

	async function transcribeAudioFile(
		audioBuffer: Buffer,
		mimeType: string,
	): Promise<TranscribeResult> {
		let response: Awaited<
			ReturnType<typeof client.listen.v1.media.transcribeFile>
		>;
		try {
			response = await client.listen.v1.media.transcribeFile(
				{ data: audioBuffer, contentType: mimeType },
				{
					model: STT_MODEL,
					smart_format: true,
					punctuate: true,
					multichannel: true,
					diarize: true,
					utterances: true,
				},
			);
		} catch (err) {
			throw toTranscribeError(err, "transcribeAudioFile");
		}

		if (!("results" in response)) {
			throw new TranscribeError(
				`transcribeAudioFile got an async response (request_id=${response.request_id}); expected inline results`,
			);
		}

		const channels = response.results.channels ?? [];
		const isMultichannel = channels.length > 1;

		const channelAlts = channels.map((c) => c.alternatives?.[0]);
		const confidences = channelAlts
			.map((a) => a?.confidence)
			.filter((c): c is number => typeof c === "number");
		const confidence =
			confidences.length > 0
				? confidences.reduce((sum, c) => sum + c, 0) / confidences.length
				: 0;

		const utterances: TranscribeUtterance[] = (
			response.results.utterances ?? []
		)
			.filter(
				(u) => typeof u.transcript === "string" && u.transcript.trim() !== "",
			)
			.map((u) => ({
				speaker: isMultichannel ? (u.channel ?? 0) : (u.speaker ?? 0),
				transcript: u.transcript ?? "",
				start: u.start ?? 0,
				end: u.end ?? 0,
				confidence: u.confidence ?? 0,
			}))
			.sort((a, b) => a.start - b.start);

		const transcript = buildConversationalTranscript(
			utterances,
			channelAlts
				.map((a) => a?.transcript ?? "")
				.filter(Boolean)
				.join(" ")
				.trim(),
		);

		return { transcript, confidence, utterances };
	}

	async function transcribeAudioStream(
		audioStream: Readable,
		onPartial: (text: string) => void,
	): Promise<string> {
		const socket = await client.listen.v1.connect({
			Authorization: `Token ${config.apiKey}`,
			model: STT_MODEL,
			smart_format: "true",
			punctuate: "true",
			interim_results: "true",
		});

		return new Promise<string>((resolve, reject) => {
			const finalSegments: string[] = [];
			let settled = false;
			const settleResolve = (value: string): void => {
				if (settled) return;
				settled = true;
				resolve(value);
			};
			const settleReject = (err: TranscribeError): void => {
				if (settled) return;
				settled = true;
				reject(err);
			};

			socket.on("message", (msg) => {
				if (msg.type !== "Results") return;
				const text = msg.channel.alternatives?.[0]?.transcript;
				if (!text) return;
				onPartial(text);
				if (msg.is_final) {
					finalSegments.push(text);
				}
			});

			socket.on("close", () => {
				settleResolve(finalSegments.join(" ").replace(/\s+/g, " ").trim());
			});

			socket.on("error", (err) => {
				settleReject(toTranscribeError(err, "transcribeAudioStream"));
			});

			audioStream.on("data", (chunk: Buffer) => {
				socket.sendMedia(chunk);
			});

			audioStream.on("end", () => {
				socket.sendCloseStream({ type: "CloseStream" });
			});

			audioStream.on("error", (err) => {
				socket.close();
				settleReject(toTranscribeError(err, "transcribeAudioStream"));
			});
		});
	}

	return { transcribeAudioFile, transcribeAudioStream };
}

// The dashboard's parseTurns splits on " — " and alternates dispatcher/caller, starting with dispatcher.
function buildConversationalTranscript(
	utterances: TranscribeUtterance[],
	fallback: string,
): string {
	if (utterances.length === 0) return fallback;
	const distinctSpeakers = new Set(utterances.map((u) => u.speaker));
	if (distinctSpeakers.size <= 1) return fallback;

	const groups: string[] = [];
	let currentSpeaker = utterances[0]?.speaker;
	let buffer: string[] = [];
	for (const u of utterances) {
		if (u.speaker !== currentSpeaker) {
			groups.push(buffer.join(" ").trim());
			buffer = [];
			currentSpeaker = u.speaker;
		}
		buffer.push(u.transcript);
	}
	if (buffer.length > 0) groups.push(buffer.join(" ").trim());
	return groups.filter(Boolean).join(" — ");
}

function toTranscribeError(err: unknown, where: string): TranscribeError {
	if (err instanceof TranscribeError) return err;
	if (err instanceof DeepgramError) {
		const status = err.statusCode ? ` (${err.statusCode})` : "";
		return new TranscribeError(`${where}: Deepgram${status} ${err.message}`, {
			cause: err,
		});
	}
	if (err instanceof Error) {
		return new TranscribeError(`${where}: ${err.message}`, { cause: err });
	}
	return new TranscribeError(`${where}: ${String(err)}`);
}
