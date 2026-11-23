"use client";

import type { Briefing, Responder, Vehicle } from "@roam/shared";
import { cn, formatHHMM, STATUS_LABEL, STATUS_TONE } from "@roam/ui";
import { useCallback } from "react";
import { usePollingResource } from "@/hooks/use-polling-resource";
import { api } from "@/lib/api";
import { Button } from "../../ui/button";
import { Icon } from "../../ui/icon";
import {
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
} from "../../ui/sidebar-primitives";
import { UnitCard } from "../../ui/unit-card";
import { formatUnitsAndCrew, resolveUnits } from "./recommendation-group.utils";

const BRIEFING_POLL_MS = 3_000;

export type DispatchState =
	| { status: "sending" | "sent" | "conflict" }
	| { status: "failed"; message: string };

const DISPATCH_LABEL: Record<DispatchState["status"], string> = {
	sending: "Dispatching…",
	sent: "Dispatched",
	conflict: "Already dispatched",
	failed: "Dispatch",
};

function hasBriefing(briefing: Briefing | null): boolean {
	return briefing !== null;
}

type RecommendationGroupProps = {
	incidentId: string;
	vehicles: Vehicle[];
	responderMap: Map<string, Responder>;
	dispatchState: DispatchState | undefined;
	onDispatch: (briefing: Briefing) => void;
};

export function RecommendationGroup({
	incidentId,
	vehicles,
	responderMap,
	dispatchState,
	onDispatch,
}: RecommendationGroupProps) {
	const loadBriefing = useCallback(async (): Promise<Briefing | null> => {
		const { briefing } = await api.incidents.get({ id: incidentId });
		return briefing ?? null;
	}, [incidentId]);
	const {
		data: briefing,
		loading,
		connected,
	} = usePollingResource(loadBriefing, null, BRIEFING_POLL_MS, hasBriefing);

	const handleDispatch = useCallback(() => {
		if (briefing) onDispatch(briefing);
	}, [briefing, onDispatch]);

	const offline = !loading && !connected;
	const units = briefing
		? resolveUnits(
				briefing.recommendedVehicleIds,
				briefing.recommendedResponderIds,
				vehicles,
				responderMap,
			)
		: [];
	const canDispatch =
		briefing !== null &&
		(dispatchState === undefined || dispatchState.status === "failed");

	return (
		<SidebarGroup>
			<SidebarGroupLabel>ROAM Agent Recommendation</SidebarGroupLabel>
			<SidebarGroupContent className="flex flex-col gap-2 px-2">
				<div className="rounded-md border border-primary/30 bg-primary/10 p-3">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-1.5">
							<Icon
								name="auto_awesome"
								className={cn(
									"text-sm text-primary",
									!briefing && !offline && "animate-pulse",
								)}
							/>
							<span className="text-2xs font-bold uppercase tracking-wider text-primary">
								{briefing
									? "Briefing"
									: offline
										? "Briefing offline · retrying"
										: "Drafting briefing…"}
							</span>
						</div>
						{briefing && (
							<span className="font-mono text-2xs tabular-nums text-muted-foreground">
								{formatHHMM(briefing.generatedAt)}
							</span>
						)}
					</div>
					{briefing && (
						<p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-foreground">
							{briefing.summary}
						</p>
					)}
				</div>

				{briefing && (
					<div className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
						{formatUnitsAndCrew(
							briefing.recommendedVehicleIds,
							briefing.recommendedResponderIds,
						)}
					</div>
				)}

				{units.map(({ vehicle, crew }) => (
					<UnitCard
						key={vehicle._id}
						tone={STATUS_TONE[vehicle.status]}
						trailingTone="muted"
						callsign={vehicle.callsign}
						meta={crew.length > 0 ? crew.join(", ") : undefined}
						trailingValue={STATUS_LABEL[vehicle.status]}
					/>
				))}

				<div className="sticky bottom-0 flex flex-col gap-1.5 bg-sidebar py-1">
					<Button
						variant="destructive"
						className="w-full"
						disabled={!canDispatch}
						onClick={handleDispatch}
					>
						{dispatchState ? DISPATCH_LABEL[dispatchState.status] : "Dispatch"}
					</Button>
					{dispatchState?.status === "failed" && (
						<p className="text-2xs text-danger">
							Dispatch failed · {dispatchState.message}
						</p>
					)}
				</div>
			</SidebarGroupContent>
		</SidebarGroup>
	);
}
