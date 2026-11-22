import { createHash, randomBytes } from "node:crypto";
import type { Program } from "@coral-xyz/anchor";
import * as anchor from "@coral-xyz/anchor";
import { Keypair, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import type { Roam } from "../../../target/types/roam";

const KIND_RECEIVED = 0;
const KIND_DISPATCHED = 1;
const KIND_ACCEPTED = 2;
const KIND_REJECTED = 3;
const KIND_ARRIVED = 4;
const KIND_CLEARED = 5;

const ZERO_RESPONDER = new Uint8Array(32);

describe("roam incident-events", () => {
	const provider = anchor.AnchorProvider.env();
	anchor.setProvider(provider);
	const program = anchor.workspace.Roam as Program<Roam>;
	const feePayer = provider.wallet;

	function newIncidentId(): Buffer {
		return randomBytes(16);
	}

	function responderHash(uuid: string): Buffer {
		return createHash("sha256").update(uuid).digest();
	}

	function eventPda(
		incidentId: Buffer | Uint8Array,
		kind: number,
		responderHashBytes: Buffer | Uint8Array,
	): anchor.web3.PublicKey {
		const [pda] = anchor.web3.PublicKey.findProgramAddressSync(
			[
				Buffer.from("event"),
				Buffer.from(incidentId),
				Buffer.from([kind]),
				Buffer.from(responderHashBytes),
			],
			program.programId,
		);
		return pda;
	}

	async function recordEvent(args: {
		incidentId: Buffer;
		kind: number;
		responderHash: Buffer | Uint8Array;
		payloadHash?: Buffer;
		occurredAt?: number;
		attestor?: Keypair;
		omitAttestorSigner?: boolean;
	}): Promise<void> {
		const payload = args.payloadHash ?? randomBytes(32);
		const occurredAt = args.occurredAt ?? Math.floor(Date.now() / 1000);
		const attestorKey = args.attestor
			? args.attestor.publicKey
			: feePayer.publicKey;
		const pda = eventPda(args.incidentId, args.kind, args.responderHash);

		const builder = program.methods
			.recordEvent(
				Array.from(args.incidentId) as number[] & { length: 16 },
				args.kind,
				Array.from(args.responderHash) as number[] & { length: 32 },
				Array.from(payload) as number[] & { length: 32 },
				new anchor.BN(occurredAt),
			)
			.accountsStrict({
				event: pda,
				feePayer: feePayer.publicKey,
				attestor: attestorKey,
				systemProgram: SystemProgram.programId,
			});

		if (args.attestor && !args.omitAttestorSigner) {
			await builder.signers([args.attestor]).rpc();
		} else {
			await builder.rpc();
		}
	}

	describe("happy path per event_kind", () => {
		it("records a `received` event (incident-scoped, attestor == fee_payer)", async () => {
			const incidentId = newIncidentId();
			await recordEvent({
				incidentId,
				kind: KIND_RECEIVED,
				responderHash: ZERO_RESPONDER,
			});
			const account = await program.account.incidentEvent.fetch(
				eventPda(incidentId, KIND_RECEIVED, ZERO_RESPONDER),
			);
			expect(Buffer.from(account.incidentId).equals(incidentId)).to.be.true;
			expect(account.eventKind).to.equal(KIND_RECEIVED);
			expect(account.attestorPubkey.equals(feePayer.publicKey)).to.be.true;
		});

		it("records a `dispatched` event (per responder)", async () => {
			const incidentId = newIncidentId();
			const opHash = responderHash("00000000-0000-4000-8000-00000000d111");
			await recordEvent({
				incidentId,
				kind: KIND_DISPATCHED,
				responderHash: opHash,
			});
			const account = await program.account.incidentEvent.fetch(
				eventPda(incidentId, KIND_DISPATCHED, opHash),
			);
			expect(account.eventKind).to.equal(KIND_DISPATCHED);
			expect(Buffer.from(account.responderIdHash).equals(opHash)).to.be.true;
		});

		it("records an `accepted` event with attestor != fee_payer (Seeker pattern)", async () => {
			const incidentId = newIncidentId();
			const opHash = responderHash("00000000-0000-4000-8000-00000000a222");
			const attestor = Keypair.generate();
			await recordEvent({
				incidentId,
				kind: KIND_ACCEPTED,
				responderHash: opHash,
				attestor,
			});
			const account = await program.account.incidentEvent.fetch(
				eventPda(incidentId, KIND_ACCEPTED, opHash),
			);
			expect(account.eventKind).to.equal(KIND_ACCEPTED);
			expect(account.attestorPubkey.equals(attestor.publicKey)).to.be.true;
			expect(account.attestorPubkey.equals(feePayer.publicKey)).to.be.false;
		});

		it("records a `rejected` event", async () => {
			const incidentId = newIncidentId();
			const opHash = responderHash("00000000-0000-4000-8000-00000000a333");
			await recordEvent({
				incidentId,
				kind: KIND_REJECTED,
				responderHash: opHash,
			});
			const account = await program.account.incidentEvent.fetch(
				eventPda(incidentId, KIND_REJECTED, opHash),
			);
			expect(account.eventKind).to.equal(KIND_REJECTED);
		});

		it("records an `arrived` event (reserved kind 4)", async () => {
			const incidentId = newIncidentId();
			const opHash = responderHash("00000000-0000-4000-8000-00000000a444");
			await recordEvent({
				incidentId,
				kind: KIND_ARRIVED,
				responderHash: opHash,
			});
			const account = await program.account.incidentEvent.fetch(
				eventPda(incidentId, KIND_ARRIVED, opHash),
			);
			expect(account.eventKind).to.equal(KIND_ARRIVED);
		});

		it("records a `cleared` event (incident-scoped)", async () => {
			const incidentId = newIncidentId();
			await recordEvent({
				incidentId,
				kind: KIND_CLEARED,
				responderHash: ZERO_RESPONDER,
			});
			const account = await program.account.incidentEvent.fetch(
				eventPda(incidentId, KIND_CLEARED, ZERO_RESPONDER),
			);
			expect(account.eventKind).to.equal(KIND_CLEARED);
		});
	});

	describe("idempotency / signer enforcement", () => {
		it("reverts on duplicate (incident_id, event_kind, responder_id_hash)", async () => {
			const incidentId = newIncidentId();
			const opHash = responderHash("00000000-0000-4000-8000-00000000dup1");
			await recordEvent({
				incidentId,
				kind: KIND_DISPATCHED,
				responderHash: opHash,
			});
			let threw = false;
			try {
				await recordEvent({
					incidentId,
					kind: KIND_DISPATCHED,
					responderHash: opHash,
				});
			} catch {
				threw = true;
			}
			expect(threw).to.be.true;
		});

		it("allows same incident_id with different event_kind (separate PDA)", async () => {
			const incidentId = newIncidentId();
			const opHash = responderHash("00000000-0000-4000-8000-00000000bb01");
			await recordEvent({
				incidentId,
				kind: KIND_DISPATCHED,
				responderHash: opHash,
			});
			await recordEvent({
				incidentId,
				kind: KIND_ACCEPTED,
				responderHash: opHash,
			});
			const dispatched = await program.account.incidentEvent.fetch(
				eventPda(incidentId, KIND_DISPATCHED, opHash),
			);
			const accepted = await program.account.incidentEvent.fetch(
				eventPda(incidentId, KIND_ACCEPTED, opHash),
			);
			expect(dispatched.eventKind).to.equal(KIND_DISPATCHED);
			expect(accepted.eventKind).to.equal(KIND_ACCEPTED);
		});

		it("fails when attestor signature is missing", async () => {
			const incidentId = newIncidentId();
			const opHash = responderHash("00000000-0000-4000-8000-00000000nos1");
			const attestor = Keypair.generate();
			let threw = false;
			try {
				await recordEvent({
					incidentId,
					kind: KIND_ACCEPTED,
					responderHash: opHash,
					attestor,
					omitAttestorSigner: true,
				});
			} catch {
				threw = true;
			}
			expect(threw).to.be.true;
		});
	});
});
