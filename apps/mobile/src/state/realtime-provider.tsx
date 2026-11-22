import { useTelemetrySocket } from "@roam/api";
import { useAtomValue, useSetAtom } from "jotai";
import type * as React from "react";
import { useEffect } from "react";
import { config } from "@/config";
import { getApiToken } from "@/lib/api";
import { authStateAtom } from "@/state/responder";
import {
	connectedAtom,
	fetchVehiclesAtom,
	telemetryAtom,
} from "@/state/vehicles";

export function RealtimeProvider({
	children,
}: {
	children: React.ReactNode;
}): React.JSX.Element {
	const fetchVehicles = useSetAtom(fetchVehiclesAtom);
	const setTelemetry = useSetAtom(telemetryAtom);
	const setConnected = useSetAtom(connectedAtom);
	const auth = useAtomValue(authStateAtom);

	const token = auth.kind === "signed-in" ? getApiToken() : null;

	const { positions, connected: telemetryConnected } = useTelemetrySocket(
		config.WS_URL,
		token,
	);

	useEffect(() => {
		void fetchVehicles();
	}, [fetchVehicles]);

	useEffect(() => {
		setTelemetry(positions);
	}, [positions, setTelemetry]);

	useEffect(() => {
		setConnected(telemetryConnected);
	}, [telemetryConnected, setConnected]);

	return <>{children}</>;
}
