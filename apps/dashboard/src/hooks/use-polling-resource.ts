"use client";

import { useEffect, useState } from "react";

export type PollingResource<T> = {
	data: T;
	loading: boolean;
	connected: boolean;
};

export function usePollingResource<T>(
	loader: () => Promise<T>,
	initial: T,
	intervalMs: number,
	stopWhen?: (data: T) => boolean,
): PollingResource<T> {
	const [data, setData] = useState<T>(initial);
	const [loading, setLoading] = useState(true);
	const [connected, setConnected] = useState(false);

	useEffect(() => {
		let cancelled = false;
		function load(): void {
			loader()
				.then((next) => {
					if (cancelled) return;
					setData(next);
					setConnected(true);
					if (stopWhen?.(next)) clearInterval(interval);
				})
				.catch(() => {
					if (!cancelled) setConnected(false);
				})
				.finally(() => {
					if (!cancelled) setLoading(false);
				});
		}
		load();
		const interval = setInterval(load, intervalMs);
		return () => {
			cancelled = true;
			clearInterval(interval);
		};
	}, [loader, intervalMs, stopWhen]);

	return { data, loading, connected };
}
