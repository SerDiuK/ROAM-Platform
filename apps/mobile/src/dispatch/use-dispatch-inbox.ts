import * as React from "react";
import { api } from "@/lib/api";
import {
	DispatchInbox,
	type DispatchInboxApi,
	type DispatchInboxState,
} from "@/dispatch/dispatch-inbox";

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
		await api.dispatch.respond(req);
	},
};

export type { DispatchInboxData, DispatchInboxState } from "@/dispatch/dispatch-inbox";

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

	return {
		state,
		showFor: inbox.showFor,
		acceptDispatch: inbox.acceptDispatch,
		declineDispatch: inbox.declineDispatch,
		dismiss: inbox.dismiss,
	};
}
