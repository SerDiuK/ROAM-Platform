export function formatRelative(date: Date | string): string {
	const d = typeof date === "string" ? new Date(date) : date;
	const diff = Math.floor((Date.now() - d.getTime()) / 1000);
	if (diff < 5) return "now";
	if (diff < 60) return `${diff}s`;
	if (diff < 3600) return `${Math.floor(diff / 60)}m`;
	if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
	return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatDuration(secs: number | undefined | null): string {
	if (secs == null) return "In progress";
	const m = Math.floor(secs / 60);
	const s = Math.round(secs % 60);
	return `${m}m ${s}s`;
}

export function formatDate(date: Date | string | undefined | null): string {
	if (!date) return "Active";
	const d = typeof date === "string" ? new Date(date) : date;
	return d.toLocaleString();
}

export function formatTime(date: Date | string): string {
	const d = typeof date === "string" ? new Date(date) : date;
	return d.toLocaleTimeString();
}

export function formatHHMM(date: Date | string): string {
	const d = typeof date === "string" ? new Date(date) : date;
	return d.toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	});
}

export function formatDistance(distanceKm: number): string {
	return distanceKm < 1
		? `${Math.round(distanceKm * 1000)} m away`
		: `${distanceKm.toFixed(1)} km away`;
}
