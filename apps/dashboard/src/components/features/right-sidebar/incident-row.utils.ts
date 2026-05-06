import type { Incident, IncidentStatus } from "@roam/shared";

export function statusToneFor(
	status: IncidentStatus,
): "primary" | "warning" | "danger" | "offline" | "muted" {
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
			// Resolved rows render with a solid primary background instead of a
			// dot — this branch is only reached defensively.
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
