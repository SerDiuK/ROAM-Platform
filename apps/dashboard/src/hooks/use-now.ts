"use client";

import { useEffect, useState } from "react";

const TICK_MS = 1_000;

export function useNow(): number {
	const [now, setNow] = useState(() => Date.now());

	useEffect(() => {
		const interval = setInterval(() => setNow(Date.now()), TICK_MS);
		return () => clearInterval(interval);
	}, []);

	return now;
}
