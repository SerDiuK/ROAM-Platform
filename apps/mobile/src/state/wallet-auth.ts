import type { Responder } from "@roam/shared";
import { atom } from "jotai";
import { api, setApiToken } from "@/lib/api";
import { mwa, SeekerCancelledError } from "@/lib/mwa";
import { registerPushToken } from "@/lib/push";
import {
	clearAuthToken,
	clearCachedName,
	clearToken,
	readAuthToken,
	readCachedName,
	writeAuthToken,
	writeCachedName,
	writeToken,
} from "@/lib/secure-storage";
import { authStateAtom } from "@/state/responder";

// Seeker SIWS sign-in state.
//   - mwaAvailableAtom: snapshot of `mwa.mwaAvailable` at boot. Login screen
//     gates the "Sign in with Seeker" CTA on this; web / iOS / Expo Go shows
//     a "Seeker required" placeholder.
//
// The bound Seeker pubkey itself lives on `responder.walletAddress` (read
// from `currentResponderAtom`) — no separate atom needed.

export const mwaAvailableAtom = atom<boolean>(mwa.mwaAvailable);

export type SignInWithSeekerResult =
	| { kind: "ok"; responder: Responder }
	| { kind: "wallet-unbound"; pubkey: string }
	| { kind: "cancelled" }
	| { kind: "error"; message: string };

// WALLET_UNBOUND surface from the backend (responder needs to pick a name on
// first sign-in for this Seeker pubkey) — distinguished from generic
// UNAUTHORIZED so the login screen can branch into its picker UI.
function isWalletUnbound(err: unknown): boolean {
	if (typeof err !== "object" || err === null) return false;
	const e = err as { code?: string; message?: string };
	return e.code === "UNAUTHORIZED" && e.message === "WALLET_UNBOUND";
}

// Sign-in flow:
//   1. POST siwsChallenge — server-issued nonce + the SIWS payload fields
//      (domain, statement) the wallet will render in its UI.
//   2. mwa.signIn(payload, { authToken }) — single `authorize` round-trip
//      with `sign_in_payload`. Wallet builds + signs the canonical SIWS
//      message and returns address + signed_message + signature in
//      `sign_in_result`. One fingerprint prompt total.
//   3. POST siwsVerify(signedMessage, signature, address, name?) — JWT +
//      responder, OR a WALLET_UNBOUND error which the caller handles by
//      re-running with the picker-selected name.
type SignInArgs = { name?: string };

export const signInWithSeekerAtom = atom(
	null,
	async (
		_get,
		set,
		args: SignInArgs = {},
	): Promise<SignInWithSeekerResult> => {
		if (!mwa.mwaAvailable) {
			return {
				kind: "error",
				message: "Mobile Wallet Adapter not available",
			};
		}

		let challenge;
		try {
			challenge = await api.auth.siwsChallenge({});
		} catch (err) {
			const message = err instanceof Error ? err.message : "Challenge failed";
			return { kind: "error", message };
		}

		const cachedAuthToken = await readAuthToken();
		const payload = {
			domain: challenge.domain,
			statement: challenge.statement,
			nonce: challenge.nonce,
		};

		let signed;
		try {
			signed = await mwa.signIn(payload, { authToken: cachedAuthToken });
		} catch (err) {
			// If we sent a cached auth_token and the wallet rejected the request
			// for any reason — instant CancellationException, ERROR_AUTHORIZATION_
			// FAILED (-1), or wallet rotated/cleared its session — drop the
			// cached token and retry once with a fresh authorize. Catches the
			// "Authorization request failed" surface as well as silent cancels.
			// The user sees a single extra prompt instead of an opaque failure
			// that requires "Forget device" to recover from.
			if (cachedAuthToken) {
				await clearAuthToken();
				try {
					signed = await mwa.signIn(payload);
				} catch (err2) {
					if (err2 instanceof SeekerCancelledError) return { kind: "cancelled" };
					// Self-heal exhausted — force a fully clean device state so the
					// next attempt starts from zero (no stale JWT, no stale name,
					// no stale auth_token). Avoids the user getting stuck in a loop
					// of "Authorization request failed" with no path forward.
					setApiToken(null);
					await clearToken();
					await clearCachedName();
					set(authStateAtom, { kind: "signed-out", cachedName: null });
					const message =
						err2 instanceof Error ? err2.message : "Signing failed";
					return { kind: "error", message };
				}
			} else if (err instanceof SeekerCancelledError) {
				return { kind: "cancelled" };
			} else {
				const message = err instanceof Error ? err.message : "Signing failed";
				return { kind: "error", message };
			}
		}

		// Persist the auth_token immediately — even if siwsVerify fails (e.g.
		// WALLET_UNBOUND), the next sign-in attempt should benefit from it.
		await writeAuthToken(signed.authToken);

		try {
			const verified = await api.auth.siwsVerify({
				signedMessage: signed.signedMessage,
				signature: signed.signature,
				address: signed.addressBase64,
				name: args.name,
			});
			setApiToken(verified.token);
			await writeToken(verified.token);
			await writeCachedName(verified.responder.name);
			set(authStateAtom, { kind: "signed-in", responder: verified.responder });
			void registerPushToken(verified.responder._id);
			return { kind: "ok", responder: verified.responder };
		} catch (err) {
			if (isWalletUnbound(err)) {
				return { kind: "wallet-unbound", pubkey: signed.address };
			}
			const message = err instanceof Error ? err.message : "Verify failed";
			return { kind: "error", message };
		}
	},
);

// Sliding-window refresh: trades the still-valid JWT for a fresh one. Mobile
// pings this every ~half-TTL while the app is foregrounded (see
// `useTokenRenewal`). Returns true on success, false if the backend rejected —
// caller drops to the login screen.
export const refreshTokenAtom = atom(
	null,
	async (_get, set): Promise<boolean> => {
		try {
			const { token, responder } = await api.auth.refresh();
			setApiToken(token);
			await writeToken(token);
			set(authStateAtom, { kind: "signed-in", responder });
			return true;
		} catch {
			setApiToken(null);
			await clearToken();
			const cachedName = await readCachedName();
			set(authStateAtom, { kind: "signed-out", cachedName });
			return false;
		}
	},
);

// Sign-out wipes the in-memory + secure-store JWT. The cached name and the
// MWA auth_token stay so the next sign-in is silent. (Use forgetDeviceAtom
// for a full reset when reassigning the device.)
export const signOutAtom = atom(null, async (_get, set) => {
	setApiToken(null);
	await clearToken();
	const cachedName = await readCachedName();
	set(authStateAtom, { kind: "signed-out", cachedName });
});

// "Forget this device" — full reset, clears the cached name + MWA auth_token
// alongside the JWT. Useful when a device is being reassigned to a different
// responder from a fresh state.
export const forgetDeviceAtom = atom(null, async (_get, set) => {
	setApiToken(null);
	await clearToken();
	await clearCachedName();
	await clearAuthToken();
	set(authStateAtom, { kind: "signed-out", cachedName: null });
});
