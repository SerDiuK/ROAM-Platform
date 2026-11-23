"use client";

import type { IncidentEvent, IncidentEventKind, Responder } from "@roam/shared";
import { cn } from "@roam/ui";
import { useCallback, useMemo } from "react";
import { usePollingResource } from "@/hooks/use-polling-resource";
import { api } from "@/lib/api";
import { ExplorerLink } from "../../ui/explorer-link";
import { StatusDot } from "../../ui/status-pill";

type IncidentChainLogProps = {
	incidentId: string;
	responderMap: Map<string, Responder>;
};

const POLL_MS = 3_000;
const NO_EVENTS: IncidentEvent[] = [];

const KIND_LABEL: Record<IncidentEventKind, string> = {
	received: "Call received",
	dispatched: "Dispatched",
	accepted: "Accepted",
	rejected: "Declined",
	arrived: "On scene",
	cleared: "Cleared",
};

const KIND_TONE: Record<IncidentEventKind, { text: string; dot: string }> = {
	received: { text: "text-muted-foreground", dot: "bg-muted-foreground" },
	dispatched: { text: "text-danger", dot: "bg-danger" },
	accepted: { text: "text-primary", dot: "bg-primary" },
	rejected: { text: "text-danger", dot: "bg-danger" },
	arrived: { text: "text-warning", dot: "bg-warning" },
	cleared: { text: "text-primary", dot: "bg-primary" },
};

function formatHHMMSS(date: Date): string {
	return date.toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	});
}

export function IncidentChainLog({
	incidentId,
	responderMap,
}: IncidentChainLogProps) {
	const loadEvents = useCallback(
		() => api.events.listByIncident({ incidentId }),
		[incidentId],
	);
	const {
		data: events,
		loading,
		connected,
	} = usePollingResource(loadEvents, NO_EVENTS, POLL_MS);

	const ordered = useMemo(
		() =>
			[...events].sort(
				(a, b) => b.occurredAt.getTime() - a.occurredAt.getTime(),
			),
		[events],
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
				<div className="text-2xs text-muted-foreground">Loading chain log…</div>
			) : ordered.length === 0 ? (
				<div className="text-2xs text-muted-foreground">No events yet</div>
			) : (
				<ol className="flex flex-col">
					{ordered.map((event, index) => (
						<ChainLogRow
							key={event._id}
							event={event}
							isLast={index === ordered.length - 1}
							responderMap={responderMap}
						/>
					))}
				</ol>
			)}

			{!loading && (
				<div className="mt-2 flex items-center gap-2 border-t border-sidebar-border pt-2 text-2xs text-muted-foreground">
					<StatusDot
						tone={connected ? "primary" : "danger"}
						size="xs"
						pulse={connected}
					/>
					{connected ? "Live" : "Disconnected"}
				</div>
			)}
		</div>
	);
}

type ChainLogRowProps = {
	event: IncidentEvent;
	isLast: boolean;
	responderMap: Map<string, Responder>;
};

function ChainLogRow({ event, isLast, responderMap }: ChainLogRowProps) {
	const tone = KIND_TONE[event.kind];
	const responder = event.responderId
		? responderMap.get(event.responderId)
		: undefined;
	const subject = responder?.displayName ?? responder?.name;

	return (
		<li className="flex gap-2.5">
			<div className="flex flex-shrink-0 flex-col items-center pt-0.5">
				<span
					className={cn("h-1.5 w-1.5 flex-shrink-0 rounded-full", tone.dot)}
				/>
				{!isLast && <span className="my-1 w-px flex-1 bg-sidebar-border" />}
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
