"use client";

import { useEffect, useRef, useState } from "react";

export type PollingResource<T> = {
	data: T;
	loading: boolean;
	connected: boolean;
};

// Generic loader-poller. The loader is captured in a ref so that callers
// don't have to memoize it — only `intervalMs` resets the schedule. A failed
// fetch flips `connected` to false but leaves the last good `data` intact, so
// the dashboard keeps showing the previous snapshot through transient blips.
export function usePollingResource<T>(
	loader: () => Promise<T>,
	initial: T,
	intervalMs: number,
): PollingResource<T> {
	const [data, setData] = useState<T>(initial);
	const [loading, setLoading] = useState(true);
	const [connected, setConnected] = useState(false);

	const loaderRef = useRef(loader);
	loaderRef.current = loader;

	useEffect(() => {
		let cancelled = false;
		const load = async (): Promise<void> => {
			try {
				const next = await loaderRef.current();
				if (cancelled) return;
				setData(next);
				setConnected(true);
			} catch {
				if (cancelled) return;
				setConnected(false);
			} finally {
				if (!cancelled) setLoading(false);
			}
		};
		void load();
		const interval = setInterval(() => void load(), intervalMs);
		return () => {
			cancelled = true;
			clearInterval(interval);
		};
	}, [intervalMs]);

	return { data, loading, connected };
}
