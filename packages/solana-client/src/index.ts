import { type AnchorProvider, type Idl, Program } from "@coral-xyz/anchor";
import { PublicKey, type Keypair } from "@solana/web3.js";
import BN from "bn.js";
import idlJson from "./idl.json";

const idl = idlJson as Idl;
const PROGRAM_ID = new PublicKey(idl.address);

export { idl as ROAM_IDL };
export const ROAM_PROGRAM_ID = PROGRAM_ID;

export type SolanaErrorCode = "TRANSACTION_FAILED" | "PDA_DERIVATION_FAILED";

export class SolanaError extends Error {
	public readonly code: SolanaErrorCode;
	public override readonly cause: unknown;

	constructor(message: string, code: SolanaErrorCode, cause?: unknown) {
		super(message);
		this.name = "SolanaError";
		this.code = code;
		this.cause = cause;
	}
}

export function getCluster(
	cluster?: string,
): "devnet" | "mainnet-beta" | "localnet" {
	const value = cluster ?? process.env.SOLANA_CLUSTER ?? "devnet";
	if (value === "devnet" || value === "mainnet-beta" || value === "localnet") {
		return value;
	}
	return "devnet";
}

// Mirrors the Rust enum order in programs/roam/src/lib.rs. Don't reorder.
export const INCIDENT_EVENT_KIND_INDEX = {
	received: 0,
	dispatched: 1,
	accepted: 2,
	rejected: 3,
	arrived: 4,
	cleared: 5,
} as const;
export type IncidentEventKindName = keyof typeof INCIDENT_EVENT_KIND_INDEX;

const ZERO_RESPONDER_HASH = new Uint8Array(32);

export type RecordIncidentEventArgs = {
	// 16-byte incident identifier (off-chain convention — typically MongoDB
	// ObjectId(12) padded to 16 or a UUID).
	incidentId: Uint8Array;
	kind: IncidentEventKindName;
	// sha256(responder UUID), 32 bytes. Pass `null` for incident-scoped events
	// (`received`, `cleared`) — the helper substitutes zeros.
	responderIdHash: Uint8Array | null;
	// Event-specific 32-byte hash. Pass zeros if unused.
	payloadHash: Uint8Array;
	// Unix seconds.
	occurredAt: number;
	// Optional second signer. If omitted, the provider wallet signs both fee_payer
	// and attestor (the demo's backend-only path).
	attestor?: Keypair;
};

export function deriveEventPda(
	incidentId: Uint8Array,
	kindIndex: number,
	responderIdHash: Uint8Array,
): PublicKey {
	if (incidentId.length !== 16) {
		throw new SolanaError(
			`incident_id must be 16 bytes, got ${incidentId.length}`,
			"PDA_DERIVATION_FAILED",
		);
	}
	if (responderIdHash.length !== 32) {
		throw new SolanaError(
			`responder_id_hash must be 32 bytes, got ${responderIdHash.length}`,
			"PDA_DERIVATION_FAILED",
		);
	}
	const [pda] = PublicKey.findProgramAddressSync(
		[
			Buffer.from("event"),
			Buffer.from(incidentId),
			Buffer.from([kindIndex]),
			Buffer.from(responderIdHash),
		],
		PROGRAM_ID,
	);
	return pda;
}

export async function recordIncidentEventOnChain(
	provider: AnchorProvider,
	args: RecordIncidentEventArgs,
): Promise<string> {
	try {
		const program = new Program(idl, provider);
		const kindIndex = INCIDENT_EVENT_KIND_INDEX[args.kind];
		const responderHash = args.responderIdHash ?? ZERO_RESPONDER_HASH;
		if (args.payloadHash.length !== 32) {
			throw new SolanaError(
				`payload_hash must be 32 bytes, got ${args.payloadHash.length}`,
				"TRANSACTION_FAILED",
			);
		}

		const eventPda = deriveEventPda(args.incidentId, kindIndex, responderHash);
		const attestorKey = args.attestor
			? args.attestor.publicKey
			: provider.wallet.publicKey;

		const builder = program.methods
			.recordEvent(
				Array.from(args.incidentId),
				kindIndex,
				Array.from(responderHash),
				Array.from(args.payloadHash),
				new BN(args.occurredAt),
			)
			.accounts({
				event: eventPda,
				feePayer: provider.wallet.publicKey,
				attestor: attestorKey,
				systemProgram: PublicKey.default,
			});

		if (args.attestor) {
			return await builder.signers([args.attestor]).rpc();
		}
		return await builder.rpc();
	} catch (err: unknown) {
		if (err instanceof SolanaError) throw err;
		throw new SolanaError(
			"Failed to record incident event on chain",
			"TRANSACTION_FAILED",
			err,
		);
	}
}
