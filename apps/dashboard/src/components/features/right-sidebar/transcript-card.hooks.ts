import { useEffect, useState } from "react";
import { CHARS_PER_SECOND } from "./transcript-card.utils";

export function useTypingReveal(totalChars: number, enabled: boolean): number {
	const [revealed, setRevealed] = useState(0);

	useEffect(() => {
		if (!enabled) return;
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
	}, [totalChars, enabled]);

	return revealed;
}
