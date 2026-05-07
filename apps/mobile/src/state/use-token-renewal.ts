import { useSetAtom } from "jotai";
import * as React from "react";
import { AppState } from "react-native";
import { refreshTokenAtom } from "@/state/wallet-auth";

// Sliding-window JWT renewal. Mounted by AuthGate while signed-in; pauses
// when the app backgrounds and resumes (with an immediate tick) when it
// returns to the foreground. On a refresh failure the atom flips authState
// → signed-out, which AuthGate observes and rerenders into LoginScreen.
//
// `intervalMs` should be ≤ half of AUTH_TOKEN_TTL_SECS so a missed tick
// doesn't strand a foregrounded user with an expired token. Default 20s
// matches a 60s server TTL.
type Options = {
	intervalMs?: number;
};

export function useTokenRenewal({ intervalMs = 20_000 }: Options = {}): void {
	const refresh = useSetAtom(refreshTokenAtom);

	React.useEffect(() => {
		// Latest-wins guard so a delayed refresh doesn't fire after we've
		// already torn down (e.g., user signed out mid-tick).
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
		// AppState starts as "active" on mount; kick the first tick off now.
		start();

		return () => {
			stopped = true;
			stop();
			sub.remove();
		};
	}, [refresh, intervalMs]);
}
