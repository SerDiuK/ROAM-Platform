import type { Responder } from "@roam/shared";
import { atom } from "jotai";
import { api, loadApiTokenFromStorage, setApiToken } from "@/lib/api";
import { registerPushToken } from "@/lib/push";
import { clearToken, readCachedName } from "@/lib/secure-storage";

// Sign-out + wallet lifecycle actions live in wallet-auth.ts so they can
// touch walletPubkeyAtom in one shot. This file only owns the auth-state +
// boot orchestration that doesn't need to know about MWA.

// Boot states the UI cares about. `unknown` is the very first paint before
// secure-store has been read; treated as an indeterminate loading state.
// `signed-out` shows the Login screen; `signed-in` shows the map.
//
// `cachedName` is kept on the signed-out state for the picker UX: if the
// device has signed in before, default the responder selection in the
// first-time-bind picker to that name.
export type AuthState =
	| { kind: "unknown" }
	| { kind: "signed-out"; cachedName: string | null; error?: string }
	| { kind: "signed-in"; responder: Responder };

export const authStateAtom = atom<AuthState>({ kind: "unknown" });

// Snapshot of the current responder for components that already read it
// (Profile screen, Home overlay). Derived from authStateAtom so they stay in
// sync without a separate write site.
export const currentResponderAtom = atom<Responder | null>((get) => {
	const state = get(authStateAtom);
	return state.kind === "signed-in" ? state.responder : null;
});

// Boot orchestrator. On cold start: hydrate token from secure-store, ask the
// backend who we are. If the token is valid, drop straight into the map and
// register the push token. Otherwise, show Login.
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
		void registerPushToken(responder._id);
	} catch {
		// Token rejected (expired / revoked / signing-secret rotated). Wipe and
		// fall back to Login. Don't surface an error — silent recovery is the
		// expected UX for a returning user with a stale token.
		setApiToken(null);
		await clearToken();
		set(authStateAtom, { kind: "signed-out", cachedName });
	}
});

