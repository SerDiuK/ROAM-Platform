"use client";

import type { IncidentEvent, IncidentEventKind, Responder } from "@roam/shared";
import { formatHHMM } from "@roam/ui";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ExplorerLink } from "../../ui/explorer-link";
import {
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
} from "../../ui/sidebar-primitives";

type IncidentTimelineProps = {
	incidentId: string;
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

const KIND_TONE: Record<IncidentEventKind, string> = {
	received: "text-muted-foreground",
	dispatched: "text-warning",
	accepted: "text-lime",
	rejected: "text-danger",
	arrived: "text-warning",
	cleared: "text-lime",
};

export function IncidentTimeline({
	incidentId,
	responderMap,
}: IncidentTimelineProps) {
	const [events, setEvents] = useState<IncidentEvent[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		const load = async (): Promise<void> => {
			try {
				const next = await api.events.listByIncident({ incidentId });
				if (!cancelled) setEvents(next);
			} catch {
				// Soft-fail — keep showing the last good snapshot through transient
				// blips. The next tick retries.
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

	return (
		<SidebarGroup>
			<SidebarGroupLabel>Timeline</SidebarGroupLabel>
			<SidebarGroupContent>
				{loading && events.length === 0 ? (
					<div className="px-2 py-3 text-2xs text-muted-foreground">
						Loading timeline…
					</div>
				) : events.length === 0 ? (
					<div className="px-2 py-3 text-2xs text-muted-foreground">
						No events yet
					</div>
				) : (
					<ol className="flex flex-col gap-2 px-2">
						{events.map((event) => {
							const responder = event.responderId
								? responderMap.get(event.responderId)
								: undefined;
							const responderLabel = responder
								? (responder.displayName ?? responder.name)
								: undefined;
							return (
								<li
									key={event._id}
									className="rounded-md border border-sidebar-border bg-sidebar-accent/20 p-2"
								>
									<div className="flex items-center justify-between gap-2">
										<span
											className={`text-2xs font-bold uppercase tracking-widest ${KIND_TONE[event.kind]}`}
										>
											{KIND_LABEL[event.kind]}
										</span>
										<span className="font-mono text-2xs tabular-nums text-muted-foreground">
											{formatHHMM(event.occurredAt)}
										</span>
									</div>
									<div className="mt-1 flex items-center justify-between gap-2">
										<span className="text-2xs text-muted-foreground">
											{responderLabel ?? "—"}
										</span>
										<ExplorerLink signature={event.solanaTxSignature} />
									</div>
								</li>
							);
						})}
					</ol>
				)}
			</SidebarGroupContent>
		</SidebarGroup>
	);
}
