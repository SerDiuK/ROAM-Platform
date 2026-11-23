import {
	AnchorProvider,
	type Idl,
	Program,
	type Wallet,
} from "@coral-xyz/anchor";
import {
	type Connection,
	type GetVersionedTransactionConfig,
	type Keypair,
	PublicKey,
	Transaction,
	type VersionedTransactionResponse,
} from "@solana/web3.js";
import BN from "bn.js";
import idlJson from "./idl.json";

// A JSON import types its strings as `string`, wider than Anchor's literal unions.
const idl = idlJson as Idl;
const PROGRAM_ID = new PublicKey(idl.address);

type SolanaErrorCode = "TRANSACTION_FAILED" | "PDA_DERIVATION_FAILED";

class SolanaError extends Error {
	public readonly code: SolanaErrorCode;
	public override readonly cause: unknown;

	constructor(message: string, code: SolanaErrorCode, cause?: unknown) {
		super(message);
		this.name = "SolanaError";
		this.code = code;
		this.cause = cause;
	}
}

// On-chain event_kind bytes (PDA seed and stored field): never renumber.
const INCIDENT_EVENT_KIND_INDEX = {
	received: 0,
	dispatched: 1,
	accepted: 2,
	rejected: 3,
	arrived: 4,
	cleared: 5,
} as const;
type IncidentEventKindName = keyof typeof INCIDENT_EVENT_KIND_INDEX;

const ZERO_RESPONDER_HASH = new Uint8Array(32);

const LANDING_TIMEOUT_MS = 30_000;
const LANDING_POLL_MS = 1_000;
const SIGNATURE_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;

function deriveEventPda(
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

class ReadOnlyWallet implements Wallet {
	public readonly payer: Keypair;
	constructor(
		public readonly publicKey: PublicKey,
		payer: Keypair,
	) {
		this.payer = payer;
	}
	async signTransaction(): Promise<never> {
		throw new SolanaError(
			"ReadOnlyWallet cannot sign — call partialSignAsFeePayer instead",
			"TRANSACTION_FAILED",
		);
	}
	async signAllTransactions(): Promise<never> {
		throw new SolanaError(
			"ReadOnlyWallet cannot sign — call partialSignAsFeePayer instead",
			"TRANSACTION_FAILED",
		);
	}
}

type EventKey = {
	incidentId: Uint8Array;
	kind: IncidentEventKindName;
	responderIdHash: Uint8Array;
};

export async function buildRecordEventTx(
	args: EventKey & {
		connection: Connection;
		payloadHash: Uint8Array;
		occurredAtSecs: number;
		attestorPubkey: PublicKey;
		feePayerPubkey: PublicKey;
	},
	feePayerKeypair: Keypair,
): Promise<Transaction> {
	if (args.payloadHash.length !== 32) {
		throw new SolanaError(
			`payload_hash must be 32 bytes, got ${args.payloadHash.length}`,
			"TRANSACTION_FAILED",
		);
	}
	const kindIndex = INCIDENT_EVENT_KIND_INDEX[args.kind];
	const eventPda = deriveEventPda(
		args.incidentId,
		kindIndex,
		args.responderIdHash,
	);

	const provider = new AnchorProvider(
		args.connection,
		new ReadOnlyWallet(args.feePayerPubkey, feePayerKeypair),
		{},
	);
	const program = new Program(idl, provider);
	const ix = await program.methods
		.recordEvent(
			Array.from(args.incidentId),
			kindIndex,
			Array.from(args.responderIdHash),
			Array.from(args.payloadHash),
			new BN(args.occurredAtSecs),
		)
		.accounts({
			event: eventPda,
			feePayer: args.feePayerPubkey,
			attestor: args.attestorPubkey,
			systemProgram: PublicKey.default,
		})
		.instruction();

	const { blockhash } = await args.connection.getLatestBlockhash();
	const tx = new Transaction({
		feePayer: args.feePayerPubkey,
		recentBlockhash: blockhash,
	});
	tx.add(ix);
	return tx;
}

export function partialSignAsFeePayer(
	tx: Transaction,
	feePayer: Keypair,
): void {
	tx.partialSign(feePayer);
}

type TransactionLookup = {
	getTransaction(
		signature: string,
		config: GetVersionedTransactionConfig,
	): Promise<VersionedTransactionResponse | null>;
};

async function waitForTransaction(
	connection: TransactionLookup,
	signature: string,
): Promise<VersionedTransactionResponse | null> {
	const deadline = Date.now() + LANDING_TIMEOUT_MS;
	for (;;) {
		const tx = await connection.getTransaction(signature, {
			commitment: "confirmed",
			maxSupportedTransactionVersion: 0,
		});
		if (tx || Date.now() >= deadline) return tx;
		await new Promise((resolve) => setTimeout(resolve, LANDING_POLL_MS));
	}
}

export async function verifyRecordEventTx(
	args: EventKey & {
		connection: TransactionLookup;
		signature: string;
		attestorPubkey: PublicKey;
	},
): Promise<boolean> {
	if (!SIGNATURE_PATTERN.test(args.signature)) return false;
	const tx = await waitForTransaction(args.connection, args.signature);
	if (!tx || tx.meta?.err) return false;

	const message = tx.transaction.message;
	const keys = message.staticAccountKeys;
	const signers = keys.slice(0, message.header.numRequiredSignatures);
	if (!signers.some((key) => key.equals(args.attestorPubkey))) return false;

	const eventPda = deriveEventPda(
		args.incidentId,
		INCIDENT_EVENT_KIND_INDEX[args.kind],
		args.responderIdHash,
	);
	return message.compiledInstructions.some(
		(ix) =>
			keys[ix.programIdIndex]?.equals(PROGRAM_ID) &&
			ix.accountKeyIndexes.some((index) => keys[index]?.equals(eventPda)),
	);
}

export async function recordIncidentEventOnChain(
	provider: AnchorProvider,
	args: {
		incidentId: Uint8Array;
		kind: IncidentEventKindName;
		responderIdHash: Uint8Array | null;
		payloadHash: Uint8Array;
		occurredAtSecs: number;
	},
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
		return await program.methods
			.recordEvent(
				Array.from(args.incidentId),
				kindIndex,
				Array.from(responderHash),
				Array.from(args.payloadHash),
				new BN(args.occurredAtSecs),
			)
			.accounts({
				event: eventPda,
				feePayer: provider.wallet.publicKey,
				attestor: provider.wallet.publicKey,
				systemProgram: PublicKey.default,
			})
			.rpc();
	} catch (err: unknown) {
		if (err instanceof SolanaError) throw err;
		throw new SolanaError(
			"Failed to record incident event on chain",
			"TRANSACTION_FAILED",
			err,
		);
	}
}
