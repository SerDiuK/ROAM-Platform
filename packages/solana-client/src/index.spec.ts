import {
	Connection,
	Keypair,
	type TransactionError,
	type VersionedTransactionResponse,
} from "@solana/web3.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildRecordEventTx, verifyRecordEventTx } from "./index";

const operator = Keypair.generate();
const seeker = Keypair.generate();
const incidentId = new Uint8Array(16).fill(1);
const responderIdHash = new Uint8Array(32).fill(2);
const SIGNATURE = "5".repeat(88);

async function landedRecordEvent(
	err: TransactionError | null = null,
): Promise<VersionedTransactionResponse> {
	const connection = new Connection("http://127.0.0.1:1");
	vi.spyOn(connection, "getLatestBlockhash").mockResolvedValue({
		blockhash: Keypair.generate().publicKey.toBase58(),
		lastValidBlockHeight: 1,
	});
	const tx = await buildRecordEventTx(
		{
			connection,
			incidentId,
			kind: "accepted",
			responderIdHash,
			payloadHash: new Uint8Array(32),
			occurredAtSecs: 1,
			attestorPubkey: seeker.publicKey,
			feePayerPubkey: operator.publicKey,
		},
		operator,
	);
	return {
		slot: 1,
		blockTime: null,
		version: "legacy",
		transaction: { message: tx.compileMessage(), signatures: [SIGNATURE] },
		meta: { err, fee: 5000, preBalances: [], postBalances: [] },
	};
}

function lookupReturning(tx: VersionedTransactionResponse | null) {
	return { getTransaction: vi.fn(async () => tx) };
}

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("verifyRecordEventTx", () => {
	it("accepts a landed record_event signed by the attestor", async () => {
		const connection = lookupReturning(await landedRecordEvent());

		const verified = await verifyRecordEventTx({
			connection,
			signature: SIGNATURE,
			incidentId,
			kind: "accepted",
			responderIdHash,
			attestorPubkey: seeker.publicKey,
		});

		expect(verified).toBe(true);
	});

	it("rejects a transaction the attestor didn't sign", async () => {
		const connection = lookupReturning(await landedRecordEvent());

		const verified = await verifyRecordEventTx({
			connection,
			signature: SIGNATURE,
			incidentId,
			kind: "accepted",
			responderIdHash,
			attestorPubkey: Keypair.generate().publicKey,
		});

		expect(verified).toBe(false);
	});

	it("rejects a transaction for a different event", async () => {
		const connection = lookupReturning(await landedRecordEvent());

		const verified = await verifyRecordEventTx({
			connection,
			signature: SIGNATURE,
			incidentId,
			kind: "cleared",
			responderIdHash,
			attestorPubkey: seeker.publicKey,
		});

		expect(verified).toBe(false);
	});

	it("rejects a transaction that failed on chain", async () => {
		const connection = lookupReturning(
			await landedRecordEvent({ InstructionError: [0, "Custom"] }),
		);

		const verified = await verifyRecordEventTx({
			connection,
			signature: SIGNATURE,
			incidentId,
			kind: "accepted",
			responderIdHash,
			attestorPubkey: seeker.publicKey,
		});

		expect(verified).toBe(false);
	});

	it("rejects a malformed signature without querying the chain", async () => {
		const connection = lookupReturning(null);

		const verified = await verifyRecordEventTx({
			connection,
			signature: "x",
			incidentId,
			kind: "accepted",
			responderIdHash,
			attestorPubkey: seeker.publicKey,
		});

		expect(verified).toBe(false);
		expect(connection.getTransaction).not.toHaveBeenCalled();
	});

	it("gives up when the transaction never lands", async () => {
		vi.useFakeTimers();
		const connection = lookupReturning(null);

		const pending = verifyRecordEventTx({
			connection,
			signature: SIGNATURE,
			incidentId,
			kind: "accepted",
			responderIdHash,
			attestorPubkey: seeker.publicKey,
		});
		await vi.advanceTimersByTimeAsync(31_000);

		expect(await pending).toBe(false);
	});
});
