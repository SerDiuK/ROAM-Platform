import { useCallback, useEffect, useRef, useState } from "react";
import type { z } from "zod";

const MIN_BACKOFF = 1_000;
const MAX_BACKOFF = 30_000;

export type ReconnectingSocketOptions<T> = {
	url: string;
	schema: z.ZodType<T>;
	onMessage: (msg: T) => void;
};

export function useReconnectingSocket<T>({
	url,
	schema,
	onMessage,
}: ReconnectingSocketOptions<T>): { connected: boolean } {
	const [connected, setConnected] = useState(false);
	const wsRef = useRef<WebSocket | null>(null);
	const backoffRef = useRef(MIN_BACKOFF);
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	// Pin onMessage in a ref so the connect callback doesn't re-fire when callers
	// pass an inline handler (which would otherwise tear down + reopen the socket).
	const onMessageRef = useRef(onMessage);
	onMessageRef.current = onMessage;

	const connect = useCallback(() => {
		const ws = new WebSocket(url);
		wsRef.current = ws;

		ws.onopen = () => {
			setConnected(true);
			backoffRef.current = MIN_BACKOFF;
		};

		ws.onmessage = (event) => {
			try {
				const raw: unknown = JSON.parse(event.data as string);
				const result = schema.safeParse(raw);
				if (!result.success) return;
				onMessageRef.current(result.data);
			} catch {
				// ignore malformed messages
			}
		};

		ws.onclose = () => {
			setConnected(false);
			const delay = backoffRef.current;
			backoffRef.current = Math.min(delay * 2, MAX_BACKOFF);
			timeoutRef.current = setTimeout(connect, delay);
		};

		ws.onerror = () => {
			ws.close();
		};
	}, [url, schema]);

	useEffect(() => {
		connect();
		return () => {
			if (timeoutRef.current) clearTimeout(timeoutRef.current);
			wsRef.current?.close();
		};
	}, [connect]);

	return { connected };
}
