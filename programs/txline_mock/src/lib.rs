use anchor_lang::prelude::*;

declare_id!("7yYhmy4x1HLW9yDUKFAewbbcigZ9DtSoMFBA6xswAA2J");

// A stand-in for TxLINE's on-chain `daily_scores_roots` publisher (ADR-0008), so the
// finalwhistle `settle` trust boundary — a score root owned by TXLINE_PROGRAM_ID — can be
// satisfied on devnet where real TxLINE does not exist. This program IS that
// TXLINE_PROGRAM_ID. Not for production: a real TxLINE program owns and signs these roots.
#[program]
pub mod txline_mock {
    use super::*;

    /// Publish (or overwrite) the 32-byte score root for a Fixture into a program-owned
    /// PDA. finalwhistle reads the root from bytes [8..40] of this account (skipping the
    /// 8-byte Anchor discriminator) and honours it only because this program owns it.
    pub fn publish_root(ctx: Context<PublishRoot>, fixture_id: u64, root: [u8; 32]) -> Result<()> {
        ctx.accounts.scores_root.root = root;
        msg!("published root for fixture {}", fixture_id);
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(fixture_id: u64)]
pub struct PublishRoot<'info> {
    #[account(
        init_if_needed,
        payer = publisher,
        space = 8 + ScoresRoot::INIT_SPACE,
        seeds = [b"root", fixture_id.to_le_bytes().as_ref()],
        bump
    )]
    pub scores_root: Account<'info, ScoresRoot>,
    #[account(mut)]
    pub publisher: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct ScoresRoot {
    pub root: [u8; 32],
}
