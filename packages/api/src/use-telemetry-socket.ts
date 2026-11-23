import { type Telemetry, TelemetrySchema } from "@roam/shared";
import { useCallback, useState } from "react";
import { useReconnectingSocket } from "./use-reconnecting-socket";

export function useTelemetrySocket(baseWsUrl: string): {
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

	const { connected } = useReconnectingSocket({
		url: `${baseWsUrl}/ws/telemetry`,
		schema: TelemetrySchema,
		onMessage: handleMessage,
	});

	return { positions, connected };
}
