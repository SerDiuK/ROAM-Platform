import { Transaction } from "@solana/web3.js";
import { getDefaultStore } from "jotai";
import { Base64 } from "js-base64";
import * as React from "react";
import { api } from "@/lib/api";
import { mwa, SeekerProtocolError } from "@/lib/mwa";
import { readAuthToken } from "@/lib/secure-storage";
import { forgetDeviceAtom } from "@/state/wallet-auth";
import {
	DispatchInbox,
	type DispatchInboxApi,
	type DispatchInboxState,
} from "./dispatch-inbox";

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
	respond: async (req) => {
		const authToken = await readAuthToken();
		if (!authToken) {
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
			if (err instanceof SeekerProtocolError) {
				void getDefaultStore().set(forgetDeviceAtom);
			}
			throw err;
		}
	},
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
							new Date(b.decidedAt).getTime() - new Date(a.decidedAt).getTime(),
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
