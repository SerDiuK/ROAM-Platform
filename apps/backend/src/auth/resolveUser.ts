import type { FastifyBaseLogger } from "fastify";
import type { Config } from "../config.js";
import type { AuthedUser } from "../rpc/context.js";
import { verifySessionToken } from "./jwt.js";

const BEARER = /^Bearer\s+(.+)$/i;

export async function resolveUser(
	authorization: string | undefined,
	config: Config,
	log: FastifyBaseLogger,
): Promise<AuthedUser | null> {
	const token = authorization
		? BEARER.exec(authorization.trim())?.[1]
		: undefined;
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
