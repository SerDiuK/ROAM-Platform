import { Readable } from "node:stream";
import { DeepgramError } from "@deepgram/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TranscribeError, createTranscriber } from "./transcribe.js";

const fakeTranscribeFile = vi.hoisted(() => vi.fn());

interface FakeSocketHandlers {
	message?: (msg: unknown) => void;
	close?: (event: unknown) => void;
	error?: (err: Error) => void;
	open?: () => void;
}

interface FakeSocket {
	on: (
		event: keyof FakeSocketHandlers,
		cb: FakeSocketHandlers[keyof FakeSocketHandlers],
	) => void;
	sendMedia: (chunk: unknown) => void;
	sendCloseStream: (msg: unknown) => void;
	close: ReturnType<typeof vi.fn>;
}

interface FakeSocketHandle {
	socket: FakeSocket;
	handlers: FakeSocketHandlers;
	sentMedia: unknown[];
	sentClose: unknown[];
}

const socketHolder = vi.hoisted(() => ({
	current: null as FakeSocketHandle | null,
}));

const fakeConnect = vi.hoisted(() =>
	vi.fn(async () => {
		const handlers: FakeSocketHandlers = {};
		const sentMedia: unknown[] = [];
		const sentClose: unknown[] = [];
		const socket: FakeSocket = {
			on(event, cb) {
				handlers[event] = cb as never;
			},
			sendMedia(chunk) {
				sentMedia.push(chunk);
			},
			sendCloseStream(msg) {
				sentClose.push(msg);
			},
			close: vi.fn(),
		};
		socketHolder.current = { socket, handlers, sentMedia, sentClose };
		return socket;
	}),
);

vi.mock("@deepgram/sdk", () => {
	class DeepgramError extends Error {
		readonly statusCode?: number;
		constructor(args: { message?: string; statusCode?: number }) {
			super(args.message);
			this.name = "DeepgramError";
			this.statusCode = args.statusCode;
		}
	}
	class DeepgramClient {
		readonly listen = {
			v1: {
				media: { transcribeFile: fakeTranscribeFile },
				connect: fakeConnect,
			},
		};
	}
	return { DeepgramClient, DeepgramError };
});

beforeEach(() => {
	fakeTranscribeFile.mockReset();
	fakeConnect.mockClear();
	socketHolder.current = null;
});

describe("transcribeAudioFile", () => {
	it("returns transcript, confidence, and diarized utterances", async () => {
		fakeTranscribeFile.mockResolvedValueOnce({
			metadata: { request_id: "req-1" },
			results: {
				channels: [
					{
						alternatives: [
							{
								transcript: "911, what's your emergency? Crash at Biscayne.",
								confidence: 0.94,
							},
						],
					},
				],
				utterances: [
					{
						speaker: 0,
						transcript: "911, what's your emergency?",
						start: 0.1,
						end: 1.4,
						confidence: 0.95,
					},
					{
						speaker: 1,
						transcript: "Crash at Biscayne.",
						start: 1.6,
						end: 2.8,
						confidence: 0.92,
					},
					{
						speaker: 1,
						transcript: "",
						start: 2.9,
						end: 3.0,
						confidence: 0.1,
					},
				],
			},
		});

		const transcriber = createTranscriber({ apiKey: "test-key" });
		const result = await transcriber.transcribeAudioFile(
			Buffer.from("fake-audio"),
			"audio/wav",
		);

		expect(result.transcript).toBe(
			"911, what's your emergency? — Crash at Biscayne.",
		);
		expect(result.confidence).toBe(0.94);
		expect(result.utterances).toEqual([
			{
				speaker: 0,
				transcript: "911, what's your emergency?",
				start: 0.1,
				end: 1.4,
				confidence: 0.95,
			},
			{
				speaker: 1,
				transcript: "Crash at Biscayne.",
				start: 1.6,
				end: 2.8,
				confidence: 0.92,
			},
		]);
		expect(fakeTranscribeFile).toHaveBeenCalledTimes(1);
		const [uploadable, request] = fakeTranscribeFile.mock.calls[0];
		expect(uploadable).toMatchObject({ contentType: "audio/wav" });
		expect(request).toMatchObject({
			model: "nova-3",
			smart_format: true,
			punctuate: true,
			multichannel: true,
			diarize: true,
			utterances: true,
		});
	});

	it("maps utterances to per-channel speakers when the response is multichannel", async () => {
		fakeTranscribeFile.mockResolvedValueOnce({
			metadata: { request_id: "req-mc" },
			results: {
				channels: [
					{
						alternatives: [
							{ transcript: "911, what's your emergency?", confidence: 0.96 },
						],
					},
					{
						alternatives: [
							{
								transcript: "Crash at Biscayne and 36th.",
								confidence: 0.92,
							},
						],
					},
				],
				utterances: [
					{
						speaker: 0,
						channel: 1,
						transcript: "Crash at Biscayne and 36th.",
						start: 1.6,
						end: 2.8,
						confidence: 0.92,
					},
					{
						speaker: 0,
						channel: 0,
						transcript: "911, what's your emergency?",
						start: 0.1,
						end: 1.4,
						confidence: 0.96,
					},
				],
			},
		});

		const transcriber = createTranscriber({ apiKey: "test-key" });
		const result = await transcriber.transcribeAudioFile(
			Buffer.from("fake-audio"),
			"audio/wav",
		);

		expect(result.transcript).toBe(
			"911, what's your emergency? — Crash at Biscayne and 36th.",
		);
		expect(result.confidence).toBeCloseTo((0.96 + 0.92) / 2, 5);
		expect(result.utterances).toEqual([
			{
				speaker: 0,
				transcript: "911, what's your emergency?",
				start: 0.1,
				end: 1.4,
				confidence: 0.96,
			},
			{
				speaker: 1,
				transcript: "Crash at Biscayne and 36th.",
				start: 1.6,
				end: 2.8,
				confidence: 0.92,
			},
		]);
	});

	it("wraps a Deepgram failure in a typed TranscribeError", async () => {
		fakeTranscribeFile.mockRejectedValueOnce(
			new DeepgramError({ message: "invalid api key", statusCode: 401 }),
		);

		const transcriber = createTranscriber({ apiKey: "test-key" });
		const promise = transcriber.transcribeAudioFile(
			Buffer.from("fake-audio"),
			"audio/wav",
		);

		await expect(promise).rejects.toBeInstanceOf(TranscribeError);
		await expect(promise).rejects.toMatchObject({
			name: "TranscribeError",
			message: expect.stringContaining("401"),
		});
	});
});

describe("transcribeAudioStream", () => {
	it("calls onPartial for each utterance the websocket emits", async () => {
		const transcriber = createTranscriber({ apiKey: "test-key" });
		const onPartial = vi.fn();
		const stream = Readable.from([Buffer.from("audio-chunk")]);

		const final = transcriber.transcribeAudioStream(stream, onPartial);

		const handle = await waitForSocket();
		handle.handlers.message?.({
			type: "Results",
			is_final: false,
			channel: { alternatives: [{ transcript: "hazmat", confidence: 0.6 }] },
		});
		handle.handlers.message?.({
			type: "Results",
			is_final: true,
			channel: {
				alternatives: [{ transcript: "hazmat spill", confidence: 0.92 }],
			},
		});
		handle.handlers.close?.({ code: 1000 });

		await final;

		expect(onPartial.mock.calls.map((c) => c[0])).toEqual([
			"hazmat",
			"hazmat spill",
		]);
	});

	it("resolves with the joined final transcript when the websocket closes", async () => {
		const transcriber = createTranscriber({ apiKey: "test-key" });
		const onPartial = vi.fn();
		const stream = Readable.from([Buffer.from("audio-chunk")]);

		const final = transcriber.transcribeAudioStream(stream, onPartial);

		const handle = await waitForSocket();
		await waitForCloseStreamSent(handle);

		handle.handlers.message?.({
			type: "Results",
			is_final: true,
			channel: {
				alternatives: [{ transcript: "hazmat spill", confidence: 0.92 }],
			},
		});
		handle.handlers.message?.({
			type: "Results",
			is_final: true,
			channel: {
				alternatives: [
					{ transcript: "two casualties smoke visible", confidence: 0.9 },
				],
			},
		});
		handle.handlers.close?.({ code: 1000 });

		await expect(final).resolves.toBe(
			"hazmat spill two casualties smoke visible",
		);
		expect(handle.sentMedia).toEqual([Buffer.from("audio-chunk")]);
		expect(handle.sentClose).toEqual([{ type: "CloseStream" }]);
	});
});

async function waitForSocket(): Promise<FakeSocketHandle> {
	for (let i = 0; i < 20; i++) {
		if (socketHolder.current) return socketHolder.current;
		await new Promise((resolve) => setImmediate(resolve));
	}
	throw new Error("fake socket was never created");
}

async function waitForCloseStreamSent(handle: FakeSocketHandle): Promise<void> {
	for (let i = 0; i < 50; i++) {
		if (handle.sentClose.length > 0) return;
		await new Promise((resolve) => setImmediate(resolve));
	}
	throw new Error("CloseStream was never sent");
}
