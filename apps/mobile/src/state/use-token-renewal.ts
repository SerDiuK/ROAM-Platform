import { useSetAtom } from "jotai";
import * as React from "react";
import { AppState } from "react-native";
import { refreshTokenAtom } from "@/state/wallet-auth";

// intervalMs must stay ≤ half the backend's AUTH_TOKEN_TTL_SECS so one missed tick can't expire the JWT.
type Options = {
	intervalMs?: number;
};

export function useTokenRenewal({ intervalMs = 20_000 }: Options = {}): void {
	const refresh = useSetAtom(refreshTokenAtom);

	React.useEffect(() => {
		let stopped = false;
		let timer: ReturnType<typeof setInterval> | null = null;

		const tick = async (): Promise<void> => {
			if (stopped) return;
			await refresh();
		};
		const start = (): void => {
			if (timer) return;
			void tick();
			timer = setInterval(() => {
				void tick();
			}, intervalMs);
		};
		const stop = (): void => {
			if (timer) {
				clearInterval(timer);
				timer = null;
			}
		};

		const sub = AppState.addEventListener("change", (next) => {
			if (next === "active") start();
			else stop();
		});
		start();

		return () => {
			stopped = true;
			stop();
			sub.remove();
		};
	}, [refresh, intervalMs]);
}
