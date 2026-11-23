export const CHARS_PER_SECOND = 25;

type Speaker = "dispatcher" | "caller";
type Turn = { speaker: Speaker; text: string };

export function parseTurns(transcript: string): Turn[] {
	const trimmed = transcript.trim();
	if (!trimmed) return [];
	const segments = trimmed
		.split(/\s*—\s*/)
		.map((s) => s.trim())
		.filter(Boolean);
	if (segments.length <= 1) return [{ speaker: "caller", text: trimmed }];
	return segments.map((text, i) => ({
		speaker: i % 2 === 0 ? "dispatcher" : "caller",
		text,
	}));
}

export function sliceTurns(turns: Turn[], revealed: number): Turn[] {
	if (revealed <= 0) return [];
	const out: Turn[] = [];
	let used = 0;
	for (const turn of turns) {
		const remaining = revealed - used;
		if (remaining <= 0) break;
		const slice = turn.text.slice(0, remaining);
		out.push({ speaker: turn.speaker, text: slice });
		used += turn.text.length;
		if (slice.length < turn.text.length) break;
	}
	return out;
}

export function formatCallDuration(callStartedAt: Date, now: number): string {
	const elapsed = Math.max(
		0,
		Math.floor((now - callStartedAt.getTime()) / 1000),
	);
	return `${Math.floor(elapsed / 60)}:${(elapsed % 60).toString().padStart(2, "0")}`;
}
