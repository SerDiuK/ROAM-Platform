import { createServer, type Server } from "node:net";
import { Aedes, type PublishPacket } from "aedes";
import type { FastifyBaseLogger } from "fastify";

export interface MqttBroker {
	aedes: Aedes;
	server: Server;
	publishCommand: (vehicleId: string, payload: object) => void;
}

export async function createMqttBroker(
	port: number,
	logger: FastifyBaseLogger,
): Promise<MqttBroker> {
	const aedes = await Aedes.createBroker();
	const server = createServer((conn) => aedes.handle(conn));

	aedes.on("client", (client) => {
		logger.info({ clientId: client.id }, "MQTT client connected");
	});

	aedes.on("clientDisconnect", (client) => {
		logger.info({ clientId: client.id }, "MQTT client disconnected");
	});

	function publishCommand(vehicleId: string, payload: object): void {
		const packet: PublishPacket = {
			topic: `vehicles/${vehicleId}/commands`,
			payload: Buffer.from(JSON.stringify(payload)),
			cmd: "publish",
			qos: 0 as const,
			dup: false,
			retain: false,
		};
		aedes.publish(packet, (err?: Error) => {
			if (err) logger.error(err, "Failed to publish command");
		});
	}

	await new Promise<void>((resolve, reject) => {
		server.listen(port, () => {
			logger.info(`MQTT broker listening on port ${port}`);
			resolve();
		});
		server.on("error", reject);
	});

	return { aedes, server, publishCommand };
}
