import type { IncidentEvent, Responder } from "@roam/shared";
import { cn, formatTime, solanaExplorerTxUrl } from "@roam/ui";
import * as React from "react";
import { Linking, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import {
	EVENT_KIND_LABEL,
	EVENT_KIND_TONE,
	shortSig,
} from "./chain-timeline.utils";

export function ChainTimeline({
	events,
	responders,
	failed,
}: {
	events: IncidentEvent[];
	responders: Responder[];
	failed: boolean;
}): React.JSX.Element {
	const sorted = React.useMemo(
		() =>
			[...events].sort(
				(a, b) =>
					new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
			),
		[events],
	);

	return (
		<View className="gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/30 p-3">
			<Text className="text-2xs font-sans-bold uppercase tracking-wider text-solana">
				On-Chain · Solana
			</Text>
			{failed ? (
				<Text className="text-2xs text-destructive">
					Couldn't refresh the on-chain events.
				</Text>
			) : null}
			{sorted.length === 0 ? (
				<Text className="text-2xs text-muted-foreground">
					No events yet — they'll land here as the chain confirms.
				</Text>
			) : (
				sorted.map((event, idx) => (
					<ChainTimelineRow
						key={event._id}
						event={event}
						responders={responders}
						isLast={idx === sorted.length - 1}
					/>
				))
			)}
		</View>
	);
}

function ChainTimelineRow({
	event,
	responders,
	isLast,
}: {
	event: IncidentEvent;
	responders: Responder[];
	isLast: boolean;
}): React.JSX.Element {
	const tone = EVENT_KIND_TONE[event.kind];
	const dotClass =
		tone === "primary"
			? "bg-primary"
			: tone === "red"
				? "bg-danger"
				: "bg-muted-foreground";
	const labelClass =
		tone === "primary"
			? "text-primary"
			: tone === "red"
				? "text-danger"
				: "text-muted-foreground";

	const responder =
		event.responderId != null
			? responders.find((r) => r._id === event.responderId)
			: undefined;
	const responderLabel = event.responderId
		? (responder?.displayName ?? responder?.name ?? "Responder")
		: "Incident";

	const sig = event.solanaTxSignature;

	return (
		<View className="flex-row gap-2">
			<View className="items-center pt-1">
				<View className={cn("h-1.5 w-1.5 rounded-full", dotClass)} />
				{!isLast ? (
					<View className="my-1 w-px flex-1 bg-sidebar-border" />
				) : null}
			</View>
			<View className="flex-1 pb-2">
				<View className="flex-row items-baseline justify-between gap-2">
					<Text
						className={cn(
							"text-2xs font-sans-bold uppercase tracking-wider",
							labelClass,
						)}
					>
						{EVENT_KIND_LABEL[event.kind]}
					</Text>
					<Text className="font-mono text-2xs text-muted-foreground">
						{formatTime(event.occurredAt)}
					</Text>
				</View>
				<Text className="mt-0.5 text-2xs text-muted-foreground">
					{responderLabel}
				</Text>
				<View className="mt-1 flex-row items-center gap-2">
					{sig ? (
						<ExplorerPill signature={sig} />
					) : (
						<View className="rounded border border-sidebar-border bg-sidebar-accent/40 px-2 py-0.5">
							<Text className="text-2xs uppercase tracking-wider text-muted-foreground">
								⬡ pending
							</Text>
						</View>
					)}
				</View>
			</View>
		</View>
	);
}

function ExplorerPill({ signature }: { signature: string }): React.JSX.Element {
	const openExplorer = React.useCallback(async (): Promise<void> => {
		try {
			await Linking.openURL(solanaExplorerTxUrl(signature));
		} catch (err) {
			console.warn("[explorer]", err);
		}
	}, [signature]);

	return (
		<Button
			onPress={openExplorer}
			variant="solana"
			size="pill"
			accessibilityLabel="Open transaction in Solana explorer"
		>
			<Text>{shortSig(signature)} ↗</Text>
		</Button>
	);
}
