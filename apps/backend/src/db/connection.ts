import mongoose from "mongoose";

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
