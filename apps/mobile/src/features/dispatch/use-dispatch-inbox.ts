import { Transaction } from "@solana/web3.js";
import { getDefaultStore } from "jotai";
import * as React from "react";
import { api } from "@/lib/api";
import { mwa, SeekerAuthorizationError } from "@/lib/mwa";
import { readAuthToken, writeAuthToken } from "@/lib/secure-storage";
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

async function signWithSeeker(serializedTx: string): Promise<string> {
	const authToken = await readAuthToken();
	if (!authToken) {
		throw new SeekerAuthorizationError("Sign in again to use your Seeker");
	}
	const tx = Transaction.from(Buffer.from(serializedTx, "base64"));
	const signed = await mwa.signAndSendTransaction(tx, { authToken });
	await writeAuthToken(signed.authToken);
	return signed.signature;
}

const apiAdapter: DispatchInboxApi = {
	getDispatch: async (id) => (await api.dispatch.get({ id })).dispatch,
	getIncident: async (id) => {
		const { incident, briefing } = await api.incidents.get({ id });
		return { incident, briefing };
	},
	listResponders: () => api.responders.list(),
	respond: async (req) => {
		const prepared = await api.dispatch.prepareResponseTx(req);
		const signature = await signWithSeeker(prepared.serializedTx);
		await api.dispatch.commitSignedResponse({ ...req, signature });
	},
	clear: async (req) => {
		const prepared = await api.dispatch.prepareClearTx(req);
		const signature = await signWithSeeker(prepared.serializedTx);
		await api.dispatch.commitSignedClear({ ...req, signature });
	},
};

function forgetDevice(): Promise<void> {
	return getDefaultStore().set(forgetDeviceAtom);
}

export type { DispatchInboxData, DispatchInboxState } from "./dispatch-inbox";

export function useDispatchInbox({ responderId }: Options): UseDispatchInbox {
	const responderIdRef = React.useRef(responderId);
	responderIdRef.current = responderId;

	const inbox = React.useMemo(
		() =>
			new DispatchInbox({
				api: apiAdapter,
				getResponderId: () => responderIdRef.current,
				forgetDevice,
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
		const showLatestPending = async (): Promise<void> => {
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
			} catch (err) {
				console.warn("[dispatch] checking for pending dispatches failed", err);
			}
		};
		showLatestPending();
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
