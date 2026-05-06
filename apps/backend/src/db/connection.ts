import mongoose from "mongoose";

// A minimal logger surface satisfied by both Fastify's app.log (Pino) and
// the platform `console`. Lets one-shot scripts (seed-*, *-smoke) pass
// console directly without an `as never` shim, while the production callers
// in src/index.ts keep using Fastify's pino logger via the same interface.
// Pino's level methods are overloaded to accept a bare string — both shapes
// satisfy `(msg: string) => void`.
export interface MinimalLogger {
	info: (msg: string) => void;
	warn: (msg: string) => void;
	error: (msg: string) => void;
}

export async function connectDb(
	url: string,
	logger: MinimalLogger,
): Promise<typeof mongoose> {
	const conn = await mongoose.connect(url);
	logger.info("MongoDB connected");
	return conn;
}
