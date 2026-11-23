import type Anthropic from "@anthropic-ai/sdk";
import type { FastifyBaseLogger } from "fastify";
import type { Transcriber } from "../agent/transcribe.js";
import type { Config } from "../config.js";
import type { ExpoPushClient } from "../push/expo.js";

export type AuthedUser = {
	id: string;
	name: string;
	role: "responder" | "dispatcher";
};

export interface RpcContext {
	config: Config;
	transcriber: Transcriber;
	anthropic: Anthropic;
	pushClient: ExpoPushClient;
	log: FastifyBaseLogger;
	user: AuthedUser | null;
}
