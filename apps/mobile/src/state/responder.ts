import type { Responder } from "@roam/shared";
import { atom } from "jotai";
import { api, loadApiTokenFromStorage, setApiToken } from "@/lib/api";
import { registerPushToken } from "@/lib/push";
import { clearToken, readCachedName } from "@/lib/secure-storage";

export type AuthState =
	| { kind: "unknown" }
	| { kind: "signed-out"; cachedName: string | null; error?: string }
	| { kind: "signed-in"; responder: Responder };

export const authStateAtom = atom<AuthState>({ kind: "unknown" });

export const currentResponderAtom = atom<Responder | null>((get) => {
	const state = get(authStateAtom);
	return state.kind === "signed-in" ? state.responder : null;
});

export const bootAuthAtom = atom(null, async (_get, set) => {
	const token = await loadApiTokenFromStorage();
	const cachedName = await readCachedName();

	if (!token) {
		set(authStateAtom, { kind: "signed-out", cachedName });
		return;
	}

	try {
		const { responder } = await api.auth.me();
		set(authStateAtom, { kind: "signed-in", responder });
		void registerPushToken();
	} catch {
		setApiToken(null);
		await clearToken();
		set(authStateAtom, { kind: "signed-out", cachedName });
	}
});
