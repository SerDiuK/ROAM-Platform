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

	// Browsers can't set headers on a WS upgrade, so the token goes in the query string.
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
