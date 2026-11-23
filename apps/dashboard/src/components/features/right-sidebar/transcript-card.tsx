"use client";

import { cn } from "@roam/ui";
import { useMemo } from "react";
import { Icon } from "../../ui/icon";
import { useTypingReveal } from "./transcript-card.hooks";
import {
	formatCallDuration,
	parseTurns,
	sliceTurns,
} from "./transcript-card.utils";

type TranscriptCardProps = {
	transcript: string;
	callStartedAt: Date;
	isLive: boolean;
	panelOpen: boolean;
	now: number;
};

export function TranscriptCard({
	transcript,
	callStartedAt,
	isLive,
	panelOpen,
	now,
}: TranscriptCardProps) {
	const turns = useMemo(() => parseTurns(transcript), [transcript]);
	const totalChars = turns.reduce((sum, t) => sum + t.text.length, 0);
	const revealed = useTypingReveal(totalChars, panelOpen);
	const visible = sliceTurns(turns, revealed);
	const showCursor = panelOpen && revealed < totalChars;

	return (
		<div className="rounded-md border border-danger/30 bg-danger/10 p-3">
			<div className="mb-2 flex items-center justify-between">
				<div className="flex items-center gap-1.5">
					<Icon
						name="phone_in_talk"
						className={cn("text-sm text-danger", isLive && "animate-pulse")}
					/>
					<span className="text-2xs font-bold uppercase tracking-wider text-danger">
						{isLive ? "Call in progress" : "Call transcript"}
					</span>
				</div>
				{isLive && (
					<span className="font-mono text-2xs tabular-nums text-muted-foreground">
						{formatCallDuration(callStartedAt, now)}
					</span>
				)}
			</div>
			<div className="flex flex-col gap-1.5">
				{visible.map((turn, i) => (
					<p
						key={i}
						className={cn(
							"m-0 whitespace-pre-wrap font-mono text-xs leading-relaxed",
							turn.speaker === "dispatcher"
								? "text-muted-foreground"
								: "text-foreground",
						)}
					>
						{turn.text}
						{showCursor && i === visible.length - 1 && (
							<span
								aria-hidden="true"
								className="ml-0.5 inline-block h-3 w-1.5 translate-y-px animate-pulse bg-danger align-middle"
							/>
						)}
					</p>
				))}
			</div>
		</div>
	);
}
