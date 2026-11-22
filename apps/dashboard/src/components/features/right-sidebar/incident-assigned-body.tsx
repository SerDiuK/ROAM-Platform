import type { Incident, Responder, Vehicle } from "@roam/shared";
import { cn, formatHHMM } from "@roam/ui";

type IncidentAssignedBodyProps = {
	incident: Incident;
	vehicles: Vehicle[];
	responderMap: Map<string, Responder>;
};

export function IncidentAssignedBody({
	incident,
	vehicles,
	responderMap,
}: IncidentAssignedBodyProps) {
	const incidentType = incident.classification?.incidentType ?? "Incident";
	const address = incident.classification?.locationDescription ?? "—";
	const isResolved = incident.status === "resolved";

	const assignedVehicles = incident.assigned.vehicles
		.map((id) => vehicles.find((v) => v._id === id))
		.filter((v): v is Vehicle => v !== undefined);
	const assignedResponderIds = new Set(incident.assigned.responders);
	const unitCount = incident.assigned.vehicles.length;
	const crewCount = incident.assigned.responders.length;
	const unitLabel = unitCount === 1 ? "Unit" : "Units";

	return (
		<>
			<div className="flex items-center justify-between px-2">
				<span className="font-mono text-sm font-bold text-foreground">
					{incidentType}
				</span>
				<span
					className={cn(
						"text-2xs font-bold uppercase tracking-widest",
						isResolved ? "text-primary" : "text-danger",
					)}
				>
					{isResolved ? "Cleared" : "Responding"}
				</span>
			</div>

			<InfoBox label="Incident">
				<InfoRow label="Address" value={address} />
				<InfoRow
					label="Dispatched"
					value={
						incident.dispatchedAt ? formatHHMM(incident.dispatchedAt) : "—"
					}
				/>
				{isResolved && (
					<InfoRow
						label="Cleared"
						value={incident.clearedAt ? formatHHMM(incident.clearedAt) : "—"}
						valueClassName="text-primary"
					/>
				)}
			</InfoBox>

			<InfoBox label={`${unitCount} ${unitLabel} · ${crewCount} Crew`}>
				{assignedVehicles.length === 0 ? (
					<div className="text-2xs text-muted-foreground">
						No units assigned.
					</div>
				) : (
					assignedVehicles.map((vehicle) => {
						const crewIds = (vehicle.assignedResponderIds ?? []).filter((id) =>
							assignedResponderIds.has(id),
						);
						const crewNames = crewIds
							.map((id) => {
								const r = responderMap.get(id);
								return r?.displayName ?? r?.name;
							})
							.filter((name): name is string => name !== undefined);
						return (
							<UnitCrewRow
								key={vehicle._id}
								callsign={vehicle.callsign}
								crew={crewNames}
							/>
						);
					})
				)}
			</InfoBox>
		</>
	);
}

function InfoBox({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="mx-2 rounded-md border border-sidebar-border bg-sidebar-accent/30 p-3">
			<div className="mb-2 text-2xs font-medium uppercase tracking-wider text-muted-foreground">
				{label}
			</div>
			<div className="flex flex-col gap-1.5">{children}</div>
		</div>
	);
}

function InfoRow({
	label,
	value,
	valueClassName,
}: {
	label: string;
	value: string;
	valueClassName?: string;
}) {
	return (
		<div className="flex items-baseline justify-between gap-3">
			<span className="text-2xs text-muted-foreground">{label}</span>
			<span
				className={cn(
					"font-mono text-xs font-medium tabular-nums text-foreground",
					valueClassName,
				)}
			>
				{value}
			</span>
		</div>
	);
}

function UnitCrewRow({ callsign, crew }: { callsign: string; crew: string[] }) {
	return (
		<div className="flex items-start justify-between gap-3">
			<span className="font-mono text-xs font-bold text-foreground">
				{callsign}
			</span>
			<span className="text-right font-mono text-xs text-muted-foreground">
				{crew.length === 0 ? (
					<span className="text-muted-foreground/60">—</span>
				) : (
					crew.map((name, i) => (
						<span key={`${name}-${i}`} className="block">
							{name}
						</span>
					))
				)}
			</span>
		</div>
	);
}
