import Anthropic from "@anthropic-ai/sdk";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { ValidationError } from "@orpc/contract";
import { OpenAPIGenerator } from "@orpc/openapi";
import { OpenAPIHandler } from "@orpc/openapi/fastify";
import { RPCHandler } from "@orpc/server/fastify";
import { ZodSmartCoercionPlugin, ZodToJsonSchemaConverter } from "@orpc/zod";
import type { FastifyBaseLogger, FastifyRequest } from "fastify";
import Fastify from "fastify";
import { createTranscriber } from "./agent/transcribe.js";
import { resolveUserFromSource } from "./auth/resolveUser.js";
import { parseConfig } from "./config.js";
import { connectDb } from "./db/connection.js";
import { seedVehicleSpecs } from "./db/seed.js";
import { createMqttBroker } from "./mqtt/broker.js";
import { registerMqttHandlers } from "./mqtt/handlers.js";
import { createExpoPushClient } from "./push/expo.js";
import type { RpcContext } from "./rpc/context.js";
import { rpcRouter } from "./rpc/router.js";
import { createWalletProvider } from "./wallet/index.js";
import { createDispatchBroadcaster } from "./ws/dispatchBroadcaster.js";
import { createIncidentBroadcaster } from "./ws/incidentBroadcaster.js";
import { createTelemetryBroadcaster } from "./ws/telemetryBroadcaster.js";
import { registerDispatchCompleteRoute } from "./x402/route.js";

async function main(): Promise<void> {
	const config = parseConfig();

	const app = Fastify({
		logger: {
			transport: {
				target: "pino-pretty",
				options: { colorize: true },
			},
		},
		// incidents.ingest carries base64 911-call audio; a 2-minute mono WAV is ~3 MB encoded.
		bodyLimit: 25 * 1024 * 1024,
	});

	await connectDb(config.MONGODB_URL, app.log);
	await seedVehicleSpecs(app.log);

	const mqttBroker = await createMqttBroker(config.MQTT_PORT, app.log);

	const telemetryBroadcaster = createTelemetryBroadcaster(app.log);
	const incidentBroadcaster = createIncidentBroadcaster(app.log);
	const dispatchBroadcaster = createDispatchBroadcaster(app.log);
	await registerMqttHandlers(mqttBroker.aedes, telemetryBroadcaster, app.log);

	const walletProvider = createWalletProvider(config);
	const transcriber = createTranscriber({ apiKey: config.DEEPGRAM_API_KEY });
	const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
	const pushClient = createExpoPushClient({
		accessToken: config.EXPO_ACCESS_TOKEN,
		logger: app.log,
	});

	await app.register(cors, {
		origin: config.DASHBOARD_ORIGINS,
	});
	await app.register(websocket);

	const buildContext = async (
		request: FastifyRequest,
	): Promise<RpcContext> => ({
		config,
		incidentBroadcaster,
		dispatchBroadcaster,
		walletProvider,
		transcriber,
		anthropic,
		pushClient,
		log: app.log,
		user: await resolveUserFromSource(
			{ authorization: request.headers.authorization },
			config,
			app.log,
		),
	});

	const logRpcError = (
		log: FastifyBaseLogger,
		path: readonly string[],
		input: unknown,
		error: unknown,
	): void => {
		const pathStr = path.join(".");
		const cause = error instanceof Error ? error.cause : undefined;
		if (cause instanceof ValidationError) {
			log.error(
				{ path: pathStr, input, issues: cause.issues, data: cause.data },
				`oRPC ${cause.message} at ${pathStr}`,
			);
			return;
		}
		log.error({ path: pathStr, input, err: error }, `oRPC error at ${pathStr}`);
	};

	const rpcHandler = new RPCHandler(rpcRouter, {
		clientInterceptors: [
			async (options) => {
				try {
					return await options.next();
				} catch (error) {
					logRpcError(app.log, options.path, options.input, error);
					throw error;
				}
			},
		],
	});
	const openapiHandler = new OpenAPIHandler(rpcRouter, {
		plugins: [new ZodSmartCoercionPlugin()],
		clientInterceptors: [
			async (options) => {
				try {
					return await options.next();
				} catch (error) {
					logRpcError(app.log, options.path, options.input, error);
					throw error;
				}
			},
		],
	});
	const openapiGenerator = new OpenAPIGenerator({
		schemaConverters: [new ZodToJsonSchemaConverter()],
	});

	registerDispatchCompleteRoute(app, config, dispatchBroadcaster, app.log);

	app.all("/rpc/*", async (request, reply) => {
		const { matched } = await rpcHandler.handle(request, reply, {
			prefix: "/rpc",
			context: await buildContext(request),
		});
		if (!matched) {
			return reply.status(404).send({ error: "not_found" });
		}
	});

	const openapiFallthrough = async (
		request: Parameters<typeof openapiHandler.handle>[0],
		reply: Parameters<typeof openapiHandler.handle>[1],
	): Promise<void> => {
		const { matched } = await openapiHandler.handle(request, reply, {
			context: await buildContext(request as FastifyRequest),
		});
		if (!matched) {
			reply.status(404).send({ error: "not_found" });
		}
	};
	app.all("/health", openapiFallthrough);
	app.all("/api/*", openapiFallthrough);

	app.get("/openapi.json", async () =>
		openapiGenerator.generate(rpcRouter, {
			info: { title: "ROAM Platform API", version: "0.1.0" },
		}),
	);

	app.get("/ws/telemetry", { websocket: true }, (socket) => {
		telemetryBroadcaster.addClient(socket);
		socket.on("close", () => {
			telemetryBroadcaster.removeClient(socket);
		});
	});

	app.get("/ws/incidents", { websocket: true }, (socket) => {
		incidentBroadcaster.addClient(socket);
		socket.on("close", () => {
			incidentBroadcaster.removeClient(socket);
		});
	});

	app.get("/ws/dispatch", { websocket: true }, (socket) => {
		dispatchBroadcaster.addClient(socket);
		socket.on("close", () => {
			dispatchBroadcaster.removeClient(socket);
		});
	});

	await app.listen({ port: config.PORT, host: "0.0.0.0" });
	app.log.info(`Server ready on port ${config.PORT}`);
}

main().catch((err: unknown) => {
	console.error("Fatal startup error:", err);
	process.exit(1);
});
