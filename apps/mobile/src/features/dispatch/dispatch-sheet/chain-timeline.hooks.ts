import type { IncidentEvent } from "@roam/shared";
import * as React from "react";
import { api } from "@/lib/api";

// Polls events for one incident every 3s while the panel is open. Best-effort
// — failures are swallowed so the panel still renders without timeline data.
// 3s is snappier than the MyEventsSheet's 5s because the responder is actively
// watching the chain confirmations land here.
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
