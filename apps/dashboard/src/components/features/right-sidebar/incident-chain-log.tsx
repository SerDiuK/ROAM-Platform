"use client";

import type {
	IncidentEvent,
	IncidentEventKind,
	Responder,
	Vehicle,
} from "@roam/shared";
import { cn } from "@roam/ui";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { ExplorerLink } from "../../ui/explorer-link";

type IncidentChainLogProps = {
	incidentId: string;
	vehicles: Vehicle[];
	responderMap: Map<string, Responder>;
};

const POLL_MS = 3_000;

const KIND_LABEL: Record<IncidentEventKind, string> = {
	received: "Call received",
	dispatched: "Dispatched",
	accepted: "Accepted",
	rejected: "Declined",
	arrived: "On scene",
	cleared: "Cleared",
};

// Tone per event kind. Lime/danger/warning come from `@roam/ui` tokens; the
// muted-foreground branch is for incident-scoped events that don't carry
// success/failure semantics on their own.
const KIND_TONE: Record<
	IncidentEventKind,
	{ text: string; dot: string }
> = {
	received: { text: "text-muted-foreground", dot: "bg-muted-foreground" },
	dispatched: { text: "text-danger", dot: "bg-danger" },
	accepted: { text: "text-lime", dot: "bg-lime" },
	rejected: { text: "text-danger", dot: "bg-danger" },
	arrived: { text: "text-warning", dot: "bg-warning" },
	cleared: { text: "text-lime", dot: "bg-lime" },
};

function formatHHMMSS(date: Date | string): string {
	const d = typeof date === "string" ? new Date(date) : date;
	return d.toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	});
}

export function IncidentChainLog({
	incidentId,
	vehicles,
	responderMap,
}: IncidentChainLogProps) {
	const [events, setEvents] = useState<IncidentEvent[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		const load = async (): Promise<void> => {
			try {
				const next = await api.events.listByIncident({ incidentId });
				if (!cancelled) setEvents(next);
			} catch {
				// Soft-fail — keep the last good snapshot through transient blips;
				// the next tick retries.
			} finally {
				if (!cancelled) setLoading(false);
			}
		};
		void load();
		const interval = setInterval(() => void load(), POLL_MS);
		return () => {
			cancelled = true;
			clearInterval(interval);
		};
	}, [incidentId]);

	const ordered = useMemo(
		() =>
			[...events].sort(
				(a, b) =>
					new Date(b.occurredAt).getTime() -
					new Date(a.occurredAt).getTime(),
			),
		[events],
	);

	const vehicleMap = useMemo(
		() => new Map(vehicles.map((v) => [v._id, v])),
		[vehicles],
	);

	const shortId = `INC-${incidentId.slice(-4).toUpperCase()}`;

	return (
		<div className="mx-2 rounded-md border border-sidebar-border bg-sidebar-accent/30 p-3">
			<div className="mb-2 flex items-center justify-between">
				<span className="text-2xs font-medium uppercase tracking-wider text-solana">
					⬡ Solana
				</span>
				<span className="font-mono text-2xs tabular-nums text-muted-foreground">
					{shortId}
				</span>
			</div>

			{loading && ordered.length === 0 ? (
				<div className="text-2xs text-muted-foreground">
					Loading chain log…
				</div>
			) : ordered.length === 0 ? (
				<div className="text-2xs text-muted-foreground">No events yet</div>
			) : (
				<ol className="flex flex-col">
					{ordered.map((event, index) => (
						<ChainLogRow
							key={event._id}
							event={event}
							isLast={index === ordered.length - 1}
							vehicleMap={vehicleMap}
							responderMap={responderMap}
						/>
					))}
				</ol>
			)}
		</div>
	);
}

type ChainLogRowProps = {
	event: IncidentEvent;
	isLast: boolean;
	vehicleMap: Map<string, Vehicle>;
	responderMap: Map<string, Responder>;
};

function ChainLogRow({
	event,
	isLast,
	vehicleMap,
	responderMap,
}: ChainLogRowProps) {
	const tone = KIND_TONE[event.kind];
	const responder = event.responderId
		? responderMap.get(event.responderId)
		: undefined;
	const responderLabel = responder?.displayName ?? responder?.name;
	const vehicle = event.payload?.vehicleId
		? vehicleMap.get(event.payload.vehicleId)
		: undefined;
	const subjectParts = [vehicle?.callsign, responderLabel].filter(
		(s): s is string => Boolean(s),
	);
	const subject = subjectParts.join(" · ");

	return (
		<li className="flex gap-2.5">
			<div className="flex flex-shrink-0 flex-col items-center pt-0.5">
				<span
					className={cn(
						"h-1.5 w-1.5 flex-shrink-0 rounded-full",
						tone.dot,
					)}
				/>
				{!isLast && (
					<span className="my-1 w-px flex-1 bg-sidebar-border" />
				)}
			</div>
			<div className={cn("flex-1", !isLast && "pb-2.5")}>
				<div className="mb-0.5 flex items-baseline justify-between gap-1.5">
					<span
						className={cn(
							"text-2xs font-semibold uppercase tracking-wider",
							tone.text,
						)}
					>
						{KIND_LABEL[event.kind]}
					</span>
					<span className="flex-shrink-0 font-mono text-2xs tabular-nums text-muted-foreground">
						{formatHHMMSS(event.occurredAt)}
					</span>
				</div>
				{subject && (
					<div className="mb-1 font-mono text-2xs text-muted-foreground">
						{subject}
					</div>
				)}
				<ExplorerLink signature={event.solanaTxSignature} />
			</div>
		</li>
	);
}
