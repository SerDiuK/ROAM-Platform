import type { Responder, SiwsChallengeResponse } from "@roam/shared";
import { atom } from "jotai";
import { api, setApiToken } from "@/lib/api";
import { mwa, SeekerCancelledError, type SignInResult } from "@/lib/mwa";
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

export const mwaAvailableAtom = atom<boolean>(mwa.mwaAvailable);

export type SignInWithSeekerResult =
	| { kind: "ok"; responder: Responder }
	| { kind: "wallet-unbound"; pubkey: string }
	| { kind: "cancelled" }
	| { kind: "error"; message: string };

// oRPC error the backend throws when this Seeker isn't bound to a responder yet.
function isWalletUnbound(err: unknown): boolean {
	if (typeof err !== "object" || err === null) return false;
	const e = err as { code?: string; message?: string };
	return e.code === "UNAUTHORIZED" && e.message === "WALLET_UNBOUND";
}

type SignInArgs = { name?: string };

export const signInWithSeekerAtom = atom(
	null,
	async (_get, set, args: SignInArgs = {}): Promise<SignInWithSeekerResult> => {
		if (!mwa.mwaAvailable) {
			return {
				kind: "error",
				message: "Mobile Wallet Adapter not available",
			};
		}

		let challenge: SiwsChallengeResponse;
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

		let signed: SignInResult;
		try {
			signed = await mwa.signIn(payload, { authToken: cachedAuthToken });
		} catch (err) {
			// A stale auth_token fails instantly (even as a cancel), so retry once with a fresh authorize.
			if (cachedAuthToken) {
				await clearAuthToken();
				try {
					signed = await mwa.signIn(payload);
				} catch (err2) {
					if (err2 instanceof SeekerCancelledError)
						return { kind: "cancelled" };
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

		// Persist before siwsVerify so a WALLET_UNBOUND re-run skips the wallet's "allow" prompt.
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
			void registerPushToken();
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

export const signOutAtom = atom(null, async (_get, set) => {
	setApiToken(null);
	await clearToken();
	const cachedName = await readCachedName();
	set(authStateAtom, { kind: "signed-out", cachedName });
});

export const forgetDeviceAtom = atom(null, async (_get, set) => {
	setApiToken(null);
	await clearToken();
	await clearCachedName();
	await clearAuthToken();
	set(authStateAtom, { kind: "signed-out", cachedName: null });
});
