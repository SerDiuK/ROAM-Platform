import { createHash, createHmac } from "node:crypto";
import type {
	IncidentEvent,
	IncidentEventKind,
	IncidentEventPayload,
} from "@roam/shared";
import { recordIncidentEventOnChain } from "@roam/solana-client";
import type { FastifyBaseLogger } from "fastify";
import { Types } from "mongoose";
import type { Config } from "../config.js";
import { IncidentEventModel } from "../db/models/incidentEvent.js";
import type { IncidentBroadcaster } from "../ws/incidentBroadcaster.js";
import { withSolanaProvider } from "./solana.js";

const ZERO_HASH = new Uint8Array(32);

function hmacKeyBuf(hmacKeyHex: string): Buffer {
	return Buffer.from(hmacKeyHex, "hex");
}

// Keyed so a leaked incident UUID can't confirm its PDA; truncation is safe as lookups only go Mongo → chain.
export function incidentIdToBytes(
	incidentId: string,
	hmacKeyHex: string,
): Uint8Array {
	const digest = createHmac("sha256", hmacKeyBuf(hmacKeyHex))
		.update(incidentId)
		.digest();
	return Uint8Array.from(digest.subarray(0, 16));
}

export function responderIdHash(
	responderId: string,
	hmacKeyHex: string,
): Uint8Array {
	return Uint8Array.from(
		createHmac("sha256", hmacKeyBuf(hmacKeyHex)).update(responderId).digest(),
	);
}

function payloadToHash(payload: IncidentEventPayload | undefined): Uint8Array {
	if (!payload || Object.keys(payload).length === 0) {
		return ZERO_HASH;
	}
	const canonical = JSON.stringify(
		Object.fromEntries(
			Object.entries(payload).sort(([a], [b]) => a.localeCompare(b)),
		),
	);
	return Uint8Array.from(createHash("sha256").update(canonical).digest());
}

// Mongoose lean docs can hold null on optional fields; IncidentEventSchema only accepts undefined.
function stripNulls<T extends object>(obj: T): T {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(obj)) {
		if (v !== null) out[k] = v;
	}
	return out as T;
}

function eventToWire(
	doc: Record<string, unknown> & { _id: unknown },
): IncidentEvent {
	const rawId = doc._id;
	const id =
		rawId instanceof Types.ObjectId ? rawId.toHexString() : String(rawId);
	const payload =
		doc.payload && typeof doc.payload === "object"
			? (stripNulls(
					doc.payload as Record<string, unknown>,
				) as IncidentEventPayload)
			: undefined;
	return {
		_id: id,
		incidentId: doc.incidentId as string,
		kind: doc.kind as IncidentEventKind,
		responderId: (doc.responderId as string | null | undefined) ?? null,
		occurredAt: doc.occurredAt as Date,
		payload,
		solanaTxSignature:
			(doc.solanaTxSignature as string | null | undefined) ?? undefined,
	};
}

type PersistArgs = {
	incidentId: string;
	kind: IncidentEventKind;
	responderId: string | null;
	occurredAt: Date;
	payload?: IncidentEventPayload;
	solanaTxSignature?: string;
};

type PersistResult = {
	doc: Record<string, unknown> & { _id: unknown };
	isNew: boolean;
};

async function persistIncidentEvent(args: PersistArgs): Promise<PersistResult> {
	try {
		const created = await IncidentEventModel.create({
			incidentId: args.incidentId,
			kind: args.kind,
			responderId: args.responderId,
			occurredAt: args.occurredAt,
			payload: args.payload,
			solanaTxSignature: args.solanaTxSignature,
		});
		return {
			doc: created.toObject() as PersistResult["doc"],
			isNew: true,
		};
	} catch (err: unknown) {
		if (
			err instanceof Error &&
			"code" in err &&
			(err as { code: number }).code === 11000
		) {
			const existing = await IncidentEventModel.findOne({
				incidentId: args.incidentId,
				kind: args.kind,
				responderId: args.responderId,
			}).lean();
			if (existing) {
				return { doc: existing as PersistResult["doc"], isNew: false };
			}
		}
		throw err;
	}
}

export async function recordIncidentEvent(
	deps: {
		config: Config;
		log: FastifyBaseLogger;
		incidentBroadcaster: IncidentBroadcaster;
	},
	args: {
		incidentId: string;
		kind: IncidentEventKind;
		responderId?: string | null;
		payload?: IncidentEventPayload;
		occurredAt?: Date;
	},
): Promise<IncidentEvent> {
	const occurredAt = args.occurredAt ?? new Date();
	const responderId = args.responderId ?? null;

	const { doc, isNew } = await persistIncidentEvent({
		incidentId: args.incidentId,
		kind: args.kind,
		responderId,
		occurredAt,
		payload: args.payload,
	});
	if (!isNew) return eventToWire(doc);

	const wire = eventToWire(doc);
	deps.incidentBroadcaster.broadcast({ type: "incident.event", event: wire });

	recordChainSignatureFollowUp(deps, {
		incidentId: args.incidentId,
		kind: args.kind,
		responderId,
		payload: args.payload,
		occurredAt,
		docId: doc._id,
	});

	return wire;
}

type ChainFollowUpDeps = {
	config: Config;
	log: FastifyBaseLogger;
	incidentBroadcaster: IncidentBroadcaster;
};

type ChainFollowUpArgs = {
	incidentId: string;
	kind: IncidentEventKind;
	responderId: string | null;
	payload?: IncidentEventPayload;
	occurredAt: Date;
	docId: unknown;
};

function recordChainSignatureFollowUp(
	deps: ChainFollowUpDeps,
	args: ChainFollowUpArgs,
): void {
	const hmacKey = deps.config.CHAIN_HMAC_KEY;
	void (async (): Promise<void> => {
		try {
			const sig = await withSolanaProvider(deps.config, deps.log, (provider) =>
				recordIncidentEventOnChain(provider, {
					incidentId: incidentIdToBytes(args.incidentId, hmacKey),
					kind: args.kind,
					responderIdHash: args.responderId
						? responderIdHash(args.responderId, hmacKey)
						: null,
					payloadHash: payloadToHash(args.payload),
					occurredAt: Math.floor(args.occurredAt.getTime() / 1000),
				}),
			);
			if (!sig) return;
			const updated = await IncidentEventModel.findByIdAndUpdate(
				args.docId,
				{ solanaTxSignature: sig },
				{ returnDocument: "after" },
			).lean();
			if (updated) {
				deps.incidentBroadcaster.broadcast({
					type: "incident.event.chain",
					event: eventToWire(updated),
				});
				deps.log.info(
					{ sig, incidentId: args.incidentId, kind: args.kind },
					"Incident event recorded on chain",
				);
			}
		} catch (err: unknown) {
			deps.log.error(
				{ err, incidentId: args.incidentId, kind: args.kind },
				"recordChainSignatureFollowUp failed (non-blocking)",
			);
		}
	})();
}

export async function recordIncidentEventWithSignature(
	deps: {
		config: Config;
		log: FastifyBaseLogger;
		incidentBroadcaster: IncidentBroadcaster;
	},
	args: {
		incidentId: string;
		kind: IncidentEventKind;
		responderId?: string | null;
		payload?: IncidentEventPayload;
		occurredAt?: Date;
		solanaTxSignature: string;
	},
): Promise<IncidentEvent> {
	const occurredAt = args.occurredAt ?? new Date();
	const responderId = args.responderId ?? null;

	const { doc, isNew } = await persistIncidentEvent({
		incidentId: args.incidentId,
		kind: args.kind,
		responderId,
		occurredAt,
		payload: args.payload,
		solanaTxSignature: args.solanaTxSignature,
	});
	const wire = eventToWire(doc);
	if (isNew) {
		deps.incidentBroadcaster.broadcast({ type: "incident.event", event: wire });
		deps.log.info(
			{
				sig: args.solanaTxSignature,
				incidentId: args.incidentId,
				kind: args.kind,
			},
			"Incident event recorded with mobile-submitted signature",
		);
	}
	return wire;
}
