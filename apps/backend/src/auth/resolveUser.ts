import type { FastifyBaseLogger } from "fastify";
import type { Config } from "../config.js";
import type { AuthedUser } from "../rpc/context.js";
import { verifySessionToken } from "./jwt.js";

// Pulls a bearer token out of either an Authorization header (RPC) or a
// `?token=...` query string (WebSocket — browsers can't set headers on WS
// upgrade). Returns the resolved user or null; never throws — middleware
// converts null → UNAUTHORIZED at the RPC layer, and the WS handler closes
// the socket on null.

export type TokenSource = {
	authorization?: string | undefined;
	queryToken?: string | undefined;
};

export function extractToken(source: TokenSource): string | null {
	if (source.authorization) {
		const match = /^Bearer\s+(.+)$/i.exec(source.authorization.trim());
		if (match) return match[1] ?? null;
	}
	if (source.queryToken) return source.queryToken;
	return null;
}

export async function resolveUserFromSource(
	source: TokenSource,
	config: Config,
	log: FastifyBaseLogger,
): Promise<AuthedUser | null> {
	const token = extractToken(source);
	if (!token) return null;
	try {
		const claims = await verifySessionToken(token, config.AUTH_SECRET);
		return {
			id: claims.sub,
			name: claims.name,
			role: claims.role,
		};
	} catch (err) {
		log.debug({ err }, "auth: token rejected");
		return null;
	}
}
