import { Transaction } from "@solana/web3.js";
import { getDefaultStore } from "jotai";
import { Base64 } from "js-base64";
import * as React from "react";
import { api } from "@/lib/api";
import { mwa, SeekerProtocolError } from "@/lib/mwa";
import { readAuthToken } from "@/lib/secure-storage";
import {
	DispatchInbox,
	type DispatchInboxApi,
	type DispatchInboxState,
} from "./dispatch-inbox";
import { forgetDeviceAtom } from "@/state/wallet-auth";

// Bridges the pure DispatchInbox state machine into React. One inbox per
// hook instance; the responderId is read live via a ref so the inbox doesn't
// need re-creating when the signed-in responder finishes loading.
type Options = {
	responderId: string | undefined;
};

type UseDispatchInbox = {
	state: DispatchInboxState;
	showFor: (dispatchId: string) => Promise<void>;
	acceptDispatch: () => Promise<void>;
	declineDispatch: (reason?: string) => Promise<void>;
	clearDispatch: () => Promise<void>;
	dismiss: () => void;
};

const apiAdapter: DispatchInboxApi = {
	getDispatch: async (id) => (await api.dispatch.get({ id })).dispatch,
	getIncident: async (id) => {
		const { incident, briefing } = await api.incidents.get({ id });
		return { incident, briefing };
	},
	listResponders: () => api.responders.list(),
	// Seeker SIWS flow:
	//   1. backend builds the unsigned record_event tx, partial-signed as
	//      fee_payer (no fingerprint yet)
	//   2. mwa.signAndSendTransaction → MWA fingerprint prompt; wallet adds
	//      the attestor signature and submits to its own RPC, returning the
	//      base58 tx signature
	//   3. backend persists the DispatchResponse + broadcasts to the dashboard
	//
	// Errors (CONFLICT, MWA cancel, RPC failure) propagate as-is — the inbox
	// state machine maps CONFLICT to its `conflict` state and everything else
	// to `error`.
	respond: async (req) => {
		const authToken = await readAuthToken();
		if (!authToken) {
			// JWT and auth_token can drift — the JWT might still be valid even
			// after the user nuked their wallet session. Force a clean re-bind
			// so the next sign-in lands in a known-good state.
			void getDefaultStore().set(forgetDeviceAtom);
			throw new Error("Sign-in required before responding");
		}
		const prepared = await api.dispatch.prepareResponseTx({
			dispatchId: req.dispatchId,
			decision: req.decision,
			declineReason: req.declineReason,
		});
		const txBytes = Base64.toUint8Array(prepared.serializedTx);
		const tx = Transaction.from(txBytes);
		try {
			const signature = await mwa.signAndSendTransaction(tx, { authToken });
			await api.dispatch.commitSignedResponse({
				dispatchId: req.dispatchId,
				decision: req.decision,
				declineReason: req.declineReason,
				signature,
			});
		} catch (err) {
			// mwa.signAndSendTransaction's internal self-heal already retries a
			// fresh authorize when the cached auth_token is stale. If we still
			// got SeekerProtocolError, the wallet truly can't auth this device
			// — wipe local state and route to Login so the user can re-bind
			// instead of looping in "Authorization request failed".
			if (err instanceof SeekerProtocolError) {
				void getDefaultStore().set(forgetDeviceAtom);
			}
			throw err;
		}
	},
	// Clear ceremony mirrors `respond` — the cleared event is incident-scoped
	// on chain (zero responder hash) but the responder still signs as attestor.
	clear: async (req) => {
		const authToken = await readAuthToken();
		if (!authToken) {
			void getDefaultStore().set(forgetDeviceAtom);
			throw new Error("Sign-in required before clearing");
		}
		const prepared = await api.dispatch.prepareClearTx({
			dispatchId: req.dispatchId,
		});
		const txBytes = Base64.toUint8Array(prepared.serializedTx);
		const tx = Transaction.from(txBytes);
		try {
			const signature = await mwa.signAndSendTransaction(tx, { authToken });
			await api.dispatch.commitSignedClear({
				dispatchId: req.dispatchId,
				signature,
			});
		} catch (err) {
			if (err instanceof SeekerProtocolError) {
				void getDefaultStore().set(forgetDeviceAtom);
			}
			throw err;
		}
	},
};

export type { DispatchInboxData, DispatchInboxState } from "./dispatch-inbox";

export function useDispatchInbox({ responderId }: Options): UseDispatchInbox {
	const responderIdRef = React.useRef(responderId);
	responderIdRef.current = responderId;

	const inbox = React.useMemo(
		() =>
			new DispatchInbox({
				api: apiAdapter,
				getResponderId: () => responderIdRef.current,
			}),
		[],
	);

	const subscribe = React.useCallback(
		(listener: () => void) => inbox.subscribe(listener),
		[inbox],
	);
	const getSnapshot = React.useCallback(() => inbox.getState(), [inbox]);
	const state = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

	// Safety net for missed pushes: once the responder is known, sweep the
	// active dispatch list for any assigned-to-me + pending + unclaimed + not-
	// expired entry and open the most recent one. Covers the cases where the
	// JS push listener didn't catch the notification (app reload, came back
	// from Login screen, OS suppressed the foreground listener, etc.). The
	// `shown` ref dedupes so we don't re-open the same dispatch after dismiss.
	const shown = React.useRef(new Set<string>());
	React.useEffect(() => {
		if (!responderId) return;
		let cancelled = false;
		void (async () => {
			try {
				const dispatches = await api.dispatch.list({});
				if (cancelled) return;
				const now = Date.now();
				const candidate = dispatches
					.filter(
						(d) =>
							d.status === "pending" &&
							d.assignedResponderIds.includes(responderId) &&
							!d.claimedByResponderIds.includes(responderId) &&
							new Date(d.expiresAt).getTime() > now &&
							!shown.current.has(d._id),
					)
					.sort(
						(a, b) =>
							new Date(b.decidedAt).getTime() -
							new Date(a.decidedAt).getTime(),
					)[0];
				if (!candidate) return;
				shown.current.add(candidate._id);
				await inbox.showFor(candidate._id);
			} catch {
				// Sweep is best-effort — push handler is the canonical path.
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [responderId, inbox]);

	return {
		state,
		showFor: inbox.showFor,
		acceptDispatch: inbox.acceptDispatch,
		declineDispatch: inbox.declineDispatch,
		clearDispatch: inbox.clearDispatch,
		dismiss: inbox.dismiss,
	};
}
