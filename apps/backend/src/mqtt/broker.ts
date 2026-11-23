import { createServer, type Server } from "node:net";
import { Aedes } from "aedes";
import type { FastifyBaseLogger } from "fastify";

interface MqttBroker {
	aedes: Aedes;
	server: Server;
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

	await new Promise<void>((resolve, reject) => {
		server.listen(port, () => {
			logger.info(`MQTT broker listening on port ${port}`);
			resolve();
		});
		server.on("error", reject);
	});

	return { aedes, server };
}
