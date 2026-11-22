import type Anthropic from "@anthropic-ai/sdk";
import type { FastifyBaseLogger } from "fastify";
import type { Transcriber } from "../agent/transcribe.js";
import type { Config } from "../config.js";
import type { ExpoPushClient } from "../push/expo.js";
import type { WalletProvider } from "../wallet/index.js";
import type { DispatchBroadcaster } from "../ws/dispatchBroadcaster.js";
import type { IncidentBroadcaster } from "../ws/incidentBroadcaster.js";

export type AuthedUser = {
	id: string;
	name: string;
	role: "responder" | "dispatcher";
};

export interface RpcContext {
	config: Config;
	incidentBroadcaster: IncidentBroadcaster;
	dispatchBroadcaster: DispatchBroadcaster;
	walletProvider: WalletProvider;
	transcriber: Transcriber;
	anthropic: Anthropic;
	pushClient: ExpoPushClient;
	log: FastifyBaseLogger;
	user: AuthedUser | null;
}
