import type { Briefing, Dispatch, Incident, Responder } from "@roam/shared";

// Pure (no React) state machine for the incoming-dispatch sheet. The React
// hook in `use-dispatch-inbox.ts` wraps this with useSyncExternalStore. Keeping
// the state transitions in plain TS lets us unit-test the flow without a DOM
// environment or @testing-library/react.

export type DispatchInboxState =
	| { kind: "idle" }
	| { kind: "loading"; dispatchId: string }
	| { kind: "incoming"; data: DispatchInboxData }
	| {
			kind: "submitting";
			data: DispatchInboxData;
			decision: "accept" | "decline";
	  }
	| { kind: "claimed"; data: DispatchInboxData }
	| { kind: "clearing"; data: DispatchInboxData }
	| { kind: "conflict"; data: DispatchInboxData; message: string }
	| { kind: "error"; message: string };

export type DispatchInboxData = {
	dispatch: Dispatch;
	incident: Incident;
	briefing: Briefing | undefined;
	responders: Responder[];
};

export type DispatchInboxApi = {
	getDispatch: (id: string) => Promise<Dispatch>;
	getIncident: (
		id: string,
	) => Promise<{ incident: Incident; briefing: Briefing | undefined }>;
	listResponders: () => Promise<Responder[]>;
	// SIWS path: backend derives responderId from the auth context. The adapter
	// composes prepareResponseTx → MWA fingerprint → sendRawTransaction →
	// commitSignedResponse internally; the inbox just sees a single async call.
	respond: (req: {
		dispatchId: string;
		decision: "accept" | "decline";
		declineReason?: string;
	}) => Promise<void>;
	// Same SIWS ceremony for the cleared event. Adapter composes
	// prepareClearTx → MWA fingerprint → sendRawTransaction →
	// commitSignedClear internally.
	clear: (req: { dispatchId: string }) => Promise<void>;
};

export type DispatchInboxDeps = {
	api: DispatchInboxApi;
	getResponderId: () => string | undefined;
};

// CONFLICT comes back as an oRPC error code — typed as { code, message }.
function isConflictError(err: unknown): err is { code: string; message: string } {
	return (
		typeof err === "object" &&
		err !== null &&
		"code" in err &&
		(err as { code?: unknown }).code === "CONFLICT"
	);
}

export class DispatchInbox {
	private current: DispatchInboxState = { kind: "idle" };
	private listeners = new Set<() => void>();
	// Latest-wins guard: a second `showFor` call supersedes any in-flight
	// fetch from the previous one. Stale resolves get dropped.
	private activeDispatchId: string | null = null;

	constructor(private deps: DispatchInboxDeps) {}

	getState(): DispatchInboxState {
		return this.current;
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	private set(next: DispatchInboxState): void {
		this.current = next;
		for (const listener of this.listeners) listener();
	}

	dismiss = (): void => {
		this.activeDispatchId = null;
		this.set({ kind: "idle" });
	};

	showFor = async (dispatchId: string): Promise<void> => {
		this.activeDispatchId = dispatchId;
		this.set({ kind: "loading", dispatchId });
		try {
			const dispatch = await this.deps.api.getDispatch(dispatchId);
			const { incident, briefing } = await this.deps.api.getIncident(
				dispatch.incidentId,
			);
			const allResponders = await this.deps.api.listResponders();
			const assigned = new Set(dispatch.assignedResponderIds);
			const responders = allResponders.filter((r) => assigned.has(r._id));

			if (this.activeDispatchId !== dispatchId) return;
			this.set({
				kind: "incoming",
				data: { dispatch, incident, briefing, responders },
			});
		} catch (err: unknown) {
			if (this.activeDispatchId !== dispatchId) return;
			const message =
				err instanceof Error ? err.message : "Failed to load dispatch";
			this.set({ kind: "error", message });
		}
	};

	private respond = async (
		decision: "accept" | "decline",
		declineReason?: string,
	): Promise<void> => {
		// `getResponderId` is the "is the user signed in" gate. The id itself
		// isn't passed to the adapter — backend derives it from the auth context.
		if (!this.deps.getResponderId()) {
			this.set({ kind: "error", message: "Not signed in" });
			return;
		}
		if (this.current.kind !== "incoming") return;
		const data = this.current.data;
		this.set({ kind: "submitting", data, decision });

		try {
			await this.deps.api.respond({
				dispatchId: data.dispatch._id,
				decision,
				declineReason,
			});
			if (decision === "accept") {
				this.set({ kind: "claimed", data });
			} else {
				this.dismiss();
			}
		} catch (err: unknown) {
			if (isConflictError(err)) {
				this.set({ kind: "conflict", data, message: err.message });
				return;
			}
			const message =
				err instanceof Error ? err.message : "Couldn't submit response";
			this.set({ kind: "error", message });
		}
	};

	acceptDispatch = (): Promise<void> => this.respond("accept");

	declineDispatch = (reason?: string): Promise<void> =>
		this.respond("decline", reason);

	clearDispatch = async (): Promise<void> => {
		if (!this.deps.getResponderId()) {
			this.set({ kind: "error", message: "Not signed in" });
			return;
		}
		// Only clear from the post-accept "claimed" state — guards against
		// double-tap or a stale UI firing after dismissal.
		if (this.current.kind !== "claimed") return;
		const data = this.current.data;
		this.set({ kind: "clearing", data });
		try {
			await this.deps.api.clear({ dispatchId: data.dispatch._id });
			this.dismiss();
		} catch (err: unknown) {
			if (isConflictError(err)) {
				this.set({ kind: "conflict", data, message: err.message });
				return;
			}
			const message =
				err instanceof Error ? err.message : "Couldn't clear dispatch";
			this.set({ kind: "error", message });
		}
	};
}
