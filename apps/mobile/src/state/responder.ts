import type { Responder } from "@roam/shared";
import { atom } from "jotai";
import { api, loadApiTokenFromStorage, setApiToken } from "@/lib/api";
import { registerPushToken } from "@/lib/push";
import {
	clearCachedName,
	clearToken,
	readCachedName,
	writeCachedName,
	writeToken,
} from "@/lib/secure-storage";

// Boot states the UI cares about. `unknown` is the very first paint before
// secure-store has been read; treated as an indeterminate loading state.
// `signed-out` shows the Login screen; `signed-in` shows the map.
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
// register the push token (post-login per AD-12 plan note). Otherwise, show
// Login pre-filled with the last-used name.
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

// Sign-in action. Called from the Login screen with name + PIN. Persists
// the token + name to secure-store, transitions to signed-in state, and
// kicks off post-login push registration.
export const signInAtom = atom(
	null,
	async (
		_get,
		set,
		args: { name: string; pin: string },
	): Promise<{ ok: boolean; error?: string }> => {
		try {
			const { token, responder } = await api.auth.signIn({
				name: args.name,
				pin: args.pin,
			});
			setApiToken(token);
			await writeToken(token);
			await writeCachedName(args.name);
			set(authStateAtom, { kind: "signed-in", responder });
			void registerPushToken(responder._id);
			return { ok: true };
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Sign-in failed";
			return { ok: false, error: msg };
		}
	},
);

// Sign-out wipes the in-memory + secure-store token. The cached name
// stays so the Login screen can pre-fill on the next launch (PIN-only re-flow).
export const signOutAtom = atom(null, async (_get, set) => {
	setApiToken(null);
	await clearToken();
	const cachedName = await readCachedName();
	set(authStateAtom, { kind: "signed-out", cachedName });
});

// "Forget this device" — full reset, clears name too. Only useful if a
// device is being reassigned to a different responder from a fresh state.
export const forgetDeviceAtom = atom(null, async (_get, set) => {
	setApiToken(null);
	await clearToken();
	await clearCachedName();
	set(authStateAtom, { kind: "signed-out", cachedName: null });
});

