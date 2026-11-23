import { useEffect, useState } from "react";
import type { z } from "zod";

const MIN_BACKOFF = 1_000;
const MAX_BACKOFF = 30_000;

type ReconnectingSocketOptions<T> = {
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

	useEffect(() => {
		let socket: WebSocket;
		let backoff = MIN_BACKOFF;
		let retry: ReturnType<typeof setTimeout> | undefined;

		function connect(): void {
			const ws = new WebSocket(url);
			socket = ws;

			ws.onopen = () => {
				setConnected(true);
				backoff = MIN_BACKOFF;
			};

			ws.onmessage = (event) => {
				let raw: unknown;
				try {
					raw = JSON.parse(event.data);
				} catch (err) {
					console.error("Dropped a socket frame that isn't JSON", err);
					return;
				}
				const result = schema.safeParse(raw);
				if (!result.success) {
					console.error("Dropped an invalid socket frame", result.error);
					return;
				}
				onMessage(result.data);
			};

			ws.onclose = () => {
				setConnected(false);
				retry = setTimeout(connect, backoff);
				backoff = Math.min(backoff * 2, MAX_BACKOFF);
			};

			ws.onerror = () => {
				ws.close();
			};
		}

		connect();
		return () => {
			clearTimeout(retry);
			socket.onclose = null;
			socket.close();
		};
	}, [url, schema, onMessage]);

	return { connected };
}
