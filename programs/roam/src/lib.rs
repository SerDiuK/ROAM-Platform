use anchor_lang::prelude::*;

declare_id!("Ad9AUd1XbFT41b92R6XgqFZQeotynLWF5aUSMp65gKQy");

// ROAM incident event log. One instruction (`record_event`) writes an
// immutable `IncidentEvent` PDA per (incident, kind, responder) tuple. The
// off-chain Mongo mirror is canonical for queries; the chain is the audit
// trail.
//
// Event kinds:
//   0 = received   (incident-scoped — responder_id_hash zeroed)
//   1 = dispatched (per responder)
//   2 = accepted   (per responder)
//   3 = rejected   (per responder)
//   4 = arrived    (per responder, fired by a future proximity-check plan)
//   5 = cleared    (incident-scoped — responder_id_hash zeroed)
//
// Split-signer: `fee_payer` is always the backend operator (mut, debited).
// `attestor` is whoever personally signed the action — the backend today;
// the responder's Seed Vault key on `accepted` / `rejected` once Seeker
// sign-in lands. Different keypairs are explicitly supported. The instruction
// stamps `attestor.key()` into the account at init time so off-chain
// `getProgramAccounts` can filter by signer without re-deriving from tx
// signatures.
//
// `incident_id` is a fixed 16-byte identifier — off-chain converts MongoDB
// ObjectId(12 bytes) padded to 16 OR derives a UUID. The chain just stores
// the bytes.
//
// `responder_id_hash` is sha256(responder UUID). Raw responder IDs never go
// on chain. Zero bytes for incident-scoped events.
//
// `payload_hash` is event-specific — sha256(briefing) for `dispatched`,
// sha256(decline reason) for `rejected`, etc. Zero bytes if unused.

#[program]
pub mod roam {
    use super::*;

    pub fn record_event(
        ctx: Context<RecordEvent>,
        incident_id: [u8; 16],
        event_kind: u8,
        responder_id_hash: [u8; 32],
        payload_hash: [u8; 32],
        occurred_at: i64,
    ) -> Result<()> {
        let event = &mut ctx.accounts.event;
        event.incident_id = incident_id;
        event.event_kind = event_kind;
        event.responder_id_hash = responder_id_hash;
        event.attestor_pubkey = ctx.accounts.attestor.key();
        event.payload_hash = payload_hash;
        event.occurred_at = occurred_at;
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(incident_id: [u8; 16], event_kind: u8, responder_id_hash: [u8; 32])]
pub struct RecordEvent<'info> {
    #[account(
        init,
        payer = fee_payer,
        space = 8 + IncidentEvent::INIT_SPACE,
        seeds = [
            b"event",
            incident_id.as_ref(),
            &[event_kind],
            responder_id_hash.as_ref(),
        ],
        bump,
    )]
    pub event: Account<'info, IncidentEvent>,
    #[account(mut)]
    pub fee_payer: Signer<'info>,
    pub attestor: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct IncidentEvent {
    pub incident_id: [u8; 16],
    pub event_kind: u8,
    pub responder_id_hash: [u8; 32],
    pub attestor_pubkey: Pubkey,
    pub payload_hash: [u8; 32],
    pub occurred_at: i64,
}
