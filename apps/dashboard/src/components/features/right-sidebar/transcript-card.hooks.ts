import { useEffect, useState } from "react";
import { CHARS_PER_SECOND } from "./transcript-card.utils";

export function useTypingReveal(
	resetKey: string,
	totalChars: number,
	enabled: boolean,
): number {
	const [revealed, setRevealed] = useState(0);

	useEffect(() => {
		if (!enabled) return;
		setRevealed(0);
		if (totalChars === 0) return;

		const handle = setInterval(() => {
			setRevealed((n) => {
				if (n >= totalChars) {
					clearInterval(handle);
					return totalChars;
				}
				return n + 1;
			});
		}, 1000 / CHARS_PER_SECOND);
		return () => clearInterval(handle);
	}, [resetKey, totalChars, enabled]);

	return revealed;
}

export function useCallDuration(callStartedAt: Date, live: boolean): string {
	const [now, setNow] = useState<number>(() => Date.now());
	useEffect(() => {
		if (!live) return;
		const interval = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(interval);
	}, [live]);

	const elapsed = Math.max(0, Math.floor((now - callStartedAt.getTime()) / 1000));
	return `${Math.floor(elapsed / 60)}:${(elapsed % 60).toString().padStart(2, "0")}`;
}
