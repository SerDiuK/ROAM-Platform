import type { Incident, IncidentStatus } from "@roam/shared";
import type { Tone } from "../../ui/status-pill";

export function statusToneFor(status: IncidentStatus): Tone {
	switch (status) {
		case "cancelled":
			return "muted";
		case "live":
		case "pending":
		case "responding":
			return "danger";
		case "arrived":
			return "warning";
		case "resolved":
			return "primary";
	}
}

export function formatAssignedCounts(incident: Incident): string {
	const vehicleCount = incident.assigned.vehicles.length;
	const responderCount = incident.assigned.responders.length;
	if (vehicleCount === 0 && responderCount === 0) return "Unassigned";
	const vehicles = `${vehicleCount} ${vehicleCount === 1 ? "vehicle" : "vehicles"}`;
	const responders = `${responderCount} ${responderCount === 1 ? "responder" : "responders"}`;
	return `${vehicles} · ${responders}`;
}
