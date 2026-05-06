import { type Telemetry, TelemetrySchema } from "@roam/shared";
import { useCallback, useState } from "react";
import { useReconnectingSocket } from "./use-reconnecting-socket";

export function useTelemetrySocket(
	baseWsUrl: string,
	token?: string | null,
): {
	positions: Map<string, Telemetry>;
	connected: boolean;
} {
	const [positions, setPositions] = useState<Map<string, Telemetry>>(
		() => new Map(),
	);

	const handleMessage = useCallback((telemetry: Telemetry) => {
		setPositions((prev) => {
			const next = new Map(prev);
			next.set(telemetry.vehicleId, telemetry);
			return next;
		});
	}, []);

	// Browsers can't set Authorization on WS upgrade; the backend reads the
	// token from `?token=...`. Treating an empty string as "no token" matches
	// what the backend does (it won't open the socket).
	const url = token
		? `${baseWsUrl}/ws/telemetry?token=${encodeURIComponent(token)}`
		: `${baseWsUrl}/ws/telemetry`;

	const { connected } = useReconnectingSocket({
		url,
		schema: TelemetrySchema,
		onMessage: handleMessage,
	});

	return { positions, connected };
}
