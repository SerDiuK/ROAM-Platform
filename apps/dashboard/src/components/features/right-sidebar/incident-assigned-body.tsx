"use client";

import type { Incident, Responder, Vehicle } from "@roam/shared";
import { cn, formatHHMM } from "@roam/ui";
import type { ReactNode } from "react";
import { formatUnitsAndCrew, resolveUnits } from "./recommendation-group.utils";

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

	const units = resolveUnits(
		incident.assigned.vehicles,
		incident.assigned.responders,
		vehicles,
		responderMap,
	);

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

			<InfoBox
				label={formatUnitsAndCrew(
					incident.assigned.vehicles,
					incident.assigned.responders,
				)}
			>
				{units.length === 0 ? (
					<div className="text-2xs text-muted-foreground">
						No units assigned.
					</div>
				) : (
					units.map(({ vehicle, crew }) => (
						<UnitCrewRow
							key={vehicle._id}
							callsign={vehicle.callsign}
							crew={crew}
						/>
					))
				)}
			</InfoBox>
		</>
	);
}

type InfoBoxProps = {
	label: string;
	children: ReactNode;
};

function InfoBox({ label, children }: InfoBoxProps) {
	return (
		<div className="mx-2 rounded-md border border-sidebar-border bg-sidebar-accent/30 p-3">
			<div className="mb-2 text-2xs font-medium uppercase tracking-wider text-muted-foreground">
				{label}
			</div>
			<div className="flex flex-col gap-1.5">{children}</div>
		</div>
	);
}

type InfoRowProps = {
	label: string;
	value: string;
	valueClassName?: string;
};

function InfoRow({ label, value, valueClassName }: InfoRowProps) {
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

type UnitCrewRowProps = {
	callsign: string;
	crew: string[];
};

function UnitCrewRow({ callsign, crew }: UnitCrewRowProps) {
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
