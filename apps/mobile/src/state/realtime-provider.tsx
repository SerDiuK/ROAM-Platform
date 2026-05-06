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

// Wires the socket streams from @roam/api into the Jotai atoms. Mounted only
// inside the signed-in branch of the App shell — so the token from secure-
// store is in memory by the time we open the WS upgrade. The WS endpoints
// reject upgrades without a valid token (see backend /ws auth gate).
//
// AD-22: the /ws/sessions subscription was removed; the dashboard / mobile
// pick up checkin/checkout state via the next vehicles.list poll. Mobile
// triggers a fetch after auth.checkin/checkout completes locally.
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
