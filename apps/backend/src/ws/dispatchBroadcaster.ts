import type { FastifyBaseLogger } from "fastify";
import type { WebSocket } from "ws";

export interface DispatchBroadcaster {
	addClient: (ws: WebSocket) => void;
	removeClient: (ws: WebSocket) => void;
	broadcast: (data: object) => void;
}

export function createDispatchBroadcaster(
	logger: FastifyBaseLogger,
): DispatchBroadcaster {
	const clients = new Set<WebSocket>();

	return {
		addClient(ws: WebSocket): void {
			clients.add(ws);
			logger.info({ count: clients.size }, "WS dispatch client added");
		},
		removeClient(ws: WebSocket): void {
			clients.delete(ws);
			logger.info({ count: clients.size }, "WS dispatch client removed");
		},
		broadcast(data: object): void {
			const message = JSON.stringify(data);
			for (const ws of clients) {
				if (ws.readyState === ws.OPEN) {
					ws.send(message);
				} else {
					clients.delete(ws);
				}
			}
		},
	};
}
