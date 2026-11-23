import type { IncidentEvent } from "@roam/shared";
import * as React from "react";
import { api } from "@/lib/api";

export function useIncidentEvents(incidentId: string): {
	events: IncidentEvent[];
	failed: boolean;
} {
	const [events, setEvents] = React.useState<IncidentEvent[]>([]);
	const [failed, setFailed] = React.useState(false);

	React.useEffect(() => {
		let cancelled = false;
		const load = async (): Promise<void> => {
			try {
				const next = await api.events.listByIncident({ incidentId });
				if (cancelled) return;
				setEvents(next);
				setFailed(false);
			} catch {
				if (!cancelled) setFailed(true);
			}
		};
		load();
		const interval = setInterval(load, 3000);
		return () => {
			cancelled = true;
			clearInterval(interval);
		};
	}, [incidentId]);

	return { events, failed };
}
