import { createHash, createHmac } from "node:crypto";
import type { IncidentEventKind, IncidentEventPayload } from "@roam/shared";
import { recordIncidentEventOnChain } from "@roam/solana-client";
import type { FastifyBaseLogger } from "fastify";
import type { Config } from "../config.js";
import { isDuplicateKeyError } from "../db/errors.js";
import { IncidentEventModel } from "../db/models/incidentEvent.js";
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

type PersistArgs = {
	incidentId: string;
	kind: IncidentEventKind;
	responderId: string | null;
	occurredAt: Date;
	payload?: IncidentEventPayload;
	solanaTxSignature?: string;
};

async function persistIncidentEvent(
	args: PersistArgs,
): Promise<{ docId: unknown; isNew: boolean }> {
	try {
		const created = await IncidentEventModel.create(args);
		return { docId: created._id, isNew: true };
	} catch (err: unknown) {
		if (!isDuplicateKeyError(err)) throw err;
		return { docId: null, isNew: false };
	}
}

type EventDeps = {
	config: Config;
	log: FastifyBaseLogger;
};

export async function recordIncidentEvent(
	deps: EventDeps,
	args: {
		incidentId: string;
		kind: IncidentEventKind;
		responderId?: string | null;
		payload?: IncidentEventPayload;
		occurredAt?: Date;
	},
): Promise<void> {
	const persist = {
		incidentId: args.incidentId,
		kind: args.kind,
		responderId: args.responderId ?? null,
		occurredAt: args.occurredAt ?? new Date(),
		payload: args.payload,
	};
	const { docId, isNew } = await persistIncidentEvent(persist);
	if (isNew) recordChainSignatureFollowUp(deps, { ...persist, docId });
}

function recordChainSignatureFollowUp(
	deps: EventDeps,
	args: Omit<PersistArgs, "solanaTxSignature"> & { docId: unknown },
): void {
	writeEventOnChain(deps, args).catch((err: unknown) => {
		deps.log.error(
			{ err, incidentId: args.incidentId, kind: args.kind },
			"recordChainSignatureFollowUp failed (non-blocking)",
		);
	});
}

async function writeEventOnChain(
	deps: EventDeps,
	args: Omit<PersistArgs, "solanaTxSignature"> & { docId: unknown },
): Promise<void> {
	const hmacKey = deps.config.CHAIN_HMAC_KEY;
	const sig = await withSolanaProvider(deps.config, deps.log, (provider) =>
		recordIncidentEventOnChain(provider, {
			incidentId: incidentIdToBytes(args.incidentId, hmacKey),
			kind: args.kind,
			responderIdHash: args.responderId
				? responderIdHash(args.responderId, hmacKey)
				: null,
			payloadHash: payloadToHash(args.payload),
			occurredAtSecs: Math.floor(args.occurredAt.getTime() / 1000),
		}),
	);
	if (!sig) return;
	await IncidentEventModel.findByIdAndUpdate(args.docId, {
		solanaTxSignature: sig,
	});
	deps.log.info(
		{ sig, incidentId: args.incidentId, kind: args.kind },
		"Incident event recorded on chain",
	);
}

export async function recordIncidentEventWithSignature(
	deps: EventDeps,
	args: {
		incidentId: string;
		kind: IncidentEventKind;
		responderId?: string | null;
		payload?: IncidentEventPayload;
		occurredAt?: Date;
		solanaTxSignature: string;
	},
): Promise<void> {
	const { isNew } = await persistIncidentEvent({
		incidentId: args.incidentId,
		kind: args.kind,
		responderId: args.responderId ?? null,
		occurredAt: args.occurredAt ?? new Date(),
		payload: args.payload,
		solanaTxSignature: args.solanaTxSignature,
	});
	if (isNew) {
		deps.log.info(
			{
				sig: args.solanaTxSignature,
				incidentId: args.incidentId,
				kind: args.kind,
			},
			"Incident event recorded with mobile-submitted signature",
		);
	}
}
