export const TELEMETRY_LIVE_MS = 30_000;

export function isLive(
	timestamp: Date,
	now: number,
	windowMs: number,
): boolean {
	return now - timestamp.getTime() <= windowMs;
}
