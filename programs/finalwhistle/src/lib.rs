use anchor_lang::prelude::*;
use anchor_spl::token::{transfer, Mint, Token, TokenAccount, Transfer};

declare_id!("3twLVgxWB3fF6EkHGoNzH4ax8sH82fz2KZjgjwg4y7fs");

/// Max Outcomes any Pool Type can have. `Match Winner (1X2)` uses 3; the O/U types
/// (added in later tickets) use 2. Fixing the array at 3 lets those Pool Types be
/// added by appending a `PoolType` variant — no Pool account layout change.
pub const MAX_OUTCOMES: usize = 3;

#[program]
pub mod finalwhistle {
    use super::*;

    /// Create a Pool on a Fixture from a provable Pool Type, Open and empty, with a
    /// Pool-owned USDC escrow. Every Pool belongs to a Group (ADR-0001) and is created
    /// from a fixed Pool Type (ADR-0002); no price is set here (ADR-0003).
    pub fn create_pool(
        ctx: Context<CreatePool>,
        group: Pubkey,
        fixture_id: u64,
        pool_type: PoolType,
        nonce: u64,
        kickoff_ts: i64,
    ) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        pool.group = group;
        pool.creator = ctx.accounts.creator.key();
        pool.fixture_id = fixture_id;
        pool.pool_type = pool_type;
        pool.nonce = nonce;
        pool.state = PoolState::Open;
        pool.kickoff_ts = kickoff_ts;
        pool.usdc_mint = ctx.accounts.usdc_mint.key();
        pool.escrow = ctx.accounts.escrow.key();
        pool.pot = 0;
        pool.outcome_totals = [0; MAX_OUTCOMES];
        pool.bump = ctx.bumps.pool;
        Ok(())
    }

    /// Place an Entry: move `amount` USDC from the caller into escrow and credit it to
    /// the caller's Entry on `outcome`, the Outcome's total, and the pot. Allowed only
    /// while the Pool is Open. Repeat Entries on the same Outcome fold into one record.
    pub fn place_entry(ctx: Context<PlaceEntry>, outcome: u8, amount: u64) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        require!(pool.state == PoolState::Open, FinalWhistleError::PoolNotOpen);
        require!(amount > 0, FinalWhistleError::ZeroAmount);
        let idx = outcome as usize;
        require!(idx < pool.outcome_count(), FinalWhistleError::InvalidOutcome);

        transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_usdc.to_account_info(),
                    to: ctx.accounts.escrow.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            amount,
        )?;

        let entry = &mut ctx.accounts.entry;
        entry.pool = pool.key();
        entry.user = ctx.accounts.user.key();
        entry.outcome = outcome;
        entry.amount = entry
            .amount
            .checked_add(amount)
            .ok_or(FinalWhistleError::Overflow)?;
        entry.bump = ctx.bumps.entry;

        pool.outcome_totals[idx] = pool.outcome_totals[idx]
            .checked_add(amount)
            .ok_or(FinalWhistleError::Overflow)?;
        pool.pot = pool.pot.checked_add(amount).ok_or(FinalWhistleError::Overflow)?;
        Ok(())
    }

    /// Lock the Pool at Fixture kickoff: no more Entries, pot and Outcome totals frozen.
    /// Permissionless (ADR-0004) — any signer may call once `now >= kickoff_ts`; the
    /// Keeper does it for UX but is not required. One-way: only an Open Pool can Lock.
    pub fn lock(ctx: Context<Lock>) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        require!(pool.state == PoolState::Open, FinalWhistleError::PoolNotOpen);
        let now = Clock::get()?.unix_timestamp;
        require!(now >= pool.kickoff_ts, FinalWhistleError::BeforeKickoff);
        pool.state = PoolState::Locked;
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(group: Pubkey, fixture_id: u64, pool_type: PoolType, nonce: u64)]
pub struct CreatePool<'info> {
    #[account(
        init,
        payer = creator,
        space = 8 + Pool::INIT_SPACE,
        seeds = [
            b"pool",
            group.as_ref(),
            &fixture_id.to_le_bytes(),
            &[pool_type as u8],
            &nonce.to_le_bytes(),
        ],
        bump
    )]
    pub pool: Account<'info, Pool>,
    #[account(
        init,
        payer = creator,
        seeds = [b"escrow", pool.key().as_ref()],
        bump,
        token::mint = usdc_mint,
        token::authority = pool,
    )]
    pub escrow: Account<'info, TokenAccount>,
    // ponytail: any SPL mint is accepted as "USDC" and stored on the Pool; every
    // downstream account is checked against pool.usdc_mint, so a Pool is internally
    // consistent. Pin this to the canonical mainnet USDC mint at the mainnet ticket.
    pub usdc_mint: Account<'info, Mint>,
    #[account(mut)]
    pub creator: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(outcome: u8)]
pub struct PlaceEntry<'info> {
    #[account(mut)]
    pub pool: Account<'info, Pool>,
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + Entry::INIT_SPACE,
        seeds = [b"entry", pool.key().as_ref(), user.key().as_ref(), &[outcome]],
        bump
    )]
    pub entry: Account<'info, Entry>,
    #[account(mut, seeds = [b"escrow", pool.key().as_ref()], bump)]
    pub escrow: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = user_usdc.mint == pool.usdc_mint @ FinalWhistleError::WrongMint,
        constraint = user_usdc.owner == user.key() @ FinalWhistleError::WrongOwner,
    )]
    pub user_usdc: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Lock<'info> {
    #[account(mut)]
    pub pool: Account<'info, Pool>,
    /// Permissionless: any signer may crank the Lock; identity is intentionally
    /// unchecked (not constrained to the creator or a Keeper). Present only so the
    /// transaction has a signer.
    pub cranker: Signer<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct Pool {
    pub group: Pubkey,
    pub creator: Pubkey,
    pub fixture_id: u64,
    pub pool_type: PoolType,
    pub nonce: u64,
    pub state: PoolState,
    pub kickoff_ts: i64,
    pub usdc_mint: Pubkey,
    pub escrow: Pubkey,
    pub pot: u64,
    pub outcome_totals: [u64; MAX_OUTCOMES],
    pub bump: u8,
}

impl Pool {
    pub fn outcome_count(&self) -> usize {
        self.pool_type.outcome_count()
    }
}

#[account]
#[derive(InitSpace)]
pub struct Entry {
    pub pool: Pubkey,
    pub user: Pubkey,
    pub outcome: u8,
    pub amount: u64,
    pub bump: u8,
}

/// The provable templates a Pool can be created from (ADR-0002). Only `MatchWinner1x2`
/// is wired in this ticket; the O/U types are appended in their own tickets — appending
/// a variant does not change the `Pool` account layout.
#[repr(u8)]
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum PoolType {
    /// Match Winner (1X2): home win / draw / away win — 3 Outcomes.
    MatchWinner,
}

impl PoolType {
    pub fn outcome_count(&self) -> usize {
        match self {
            PoolType::MatchWinner => 3,
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum PoolState {
    Open,
    Locked,
    Settled,
    Void,
}

#[error_code]
pub enum FinalWhistleError {
    #[msg("Pool is not Open")]
    PoolNotOpen,
    #[msg("Fixture kickoff time has not been reached")]
    BeforeKickoff,
    #[msg("Entry amount must be greater than zero")]
    ZeroAmount,
    #[msg("Outcome index is out of range for this Pool Type")]
    InvalidOutcome,
    #[msg("Token account mint does not match the Pool's USDC mint")]
    WrongMint,
    #[msg("Token account is not owned by the signer")]
    WrongOwner,
    #[msg("Arithmetic overflow")]
    Overflow,
}
