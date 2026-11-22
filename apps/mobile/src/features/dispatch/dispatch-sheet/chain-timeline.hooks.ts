import type { IncidentEvent } from "@roam/shared";
import * as React from "react";
import { api } from "@/lib/api";

export function useIncidentEvents(incidentId: string): IncidentEvent[] {
	const [events, setEvents] = React.useState<IncidentEvent[]>([]);

	React.useEffect(() => {
		let cancelled = false;
		const load = async (): Promise<void> => {
			try {
				const next = await api.events.listByIncident({ incidentId });
				if (!cancelled) setEvents(next);
			} catch {
				// best-effort — the panel is still useful without the timeline
			}
		};
		void load();
		const interval = setInterval(() => void load(), 3000);
		return () => {
			cancelled = true;
			clearInterval(interval);
		};
	}, [incidentId]);

	return events;
}
