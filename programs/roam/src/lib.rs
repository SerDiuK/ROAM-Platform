use anchor_lang::prelude::*;

declare_id!("Ad9AUd1XbFT41b92R6XgqFZQeotynLWF5aUSMp65gKQy");

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
