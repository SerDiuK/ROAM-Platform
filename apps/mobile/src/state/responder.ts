import { ORPCError } from "@orpc/client";
import type { Responder } from "@roam/shared";
import { atom } from "jotai";
import { api, loadApiTokenFromStorage, setApiToken } from "@/lib/api";
import { registerPushToken } from "@/lib/push";
import { clearToken, readCachedName } from "@/lib/secure-storage";

type AuthState =
	| { kind: "unknown" }
	| { kind: "signed-out"; cachedName: string | null }
	| { kind: "signed-in"; responder: Responder };

export const authStateAtom = atom<AuthState>({ kind: "unknown" });

export const currentResponderAtom = atom<Responder | null>((get) => {
	const state = get(authStateAtom);
	return state.kind === "signed-in" ? state.responder : null;
});

export const bootAuthAtom = atom(null, async (_get, set): Promise<void> => {
	let token: string | null;
	let cachedName: string | null;
	try {
		token = await loadApiTokenFromStorage();
		cachedName = await readCachedName();
	} catch (err) {
		console.warn("[auth] reading the stored session failed", err);
		set(authStateAtom, { kind: "signed-out", cachedName: null });
		return;
	}

	if (!token) {
		set(authStateAtom, { kind: "signed-out", cachedName });
		return;
	}

	try {
		const { responder } = await api.auth.me();
		set(authStateAtom, { kind: "signed-in", responder });
	} catch (err) {
		set(authStateAtom, { kind: "signed-out", cachedName });
		if (err instanceof ORPCError && err.code === "UNAUTHORIZED") {
			setApiToken(null);
			await clearToken();
		} else {
			console.warn("[auth] restoring the session failed", err);
		}
		return;
	}
	await registerPushToken();
});
