use anchor_lang::prelude::*;

declare_id!("3twLVgxWB3fF6EkHGoNzH4ax8sH82fz2KZjgjwg4y7fs");

// ponytail: this whole `initialize`/`Beacon` pair is a throwaway smoke target so the
// SVM harness has one instruction to call and one account to assert on (ticket T1).
// T2 (create Pool + place Entry) replaces it with the real Pool logic — delete then.
#[program]
pub mod finalwhistle {
    use super::*;

    /// No-op smoke instruction: initialize a Beacon PDA carrying a caller-chosen value,
    /// so a test can call an instruction and assert on its on-chain effect.
    pub fn initialize(ctx: Context<Initialize>, value: u64) -> Result<()> {
        ctx.accounts.beacon.value = value;
        msg!("beacon initialized: {}", value);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + Beacon::INIT_SPACE,
        seeds = [b"beacon"],
        bump
    )]
    pub beacon: Account<'info, Beacon>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct Beacon {
    pub value: u64,
}
