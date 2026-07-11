use anchor_lang::prelude::*;
use anchor_lang::solana_program::keccak;
use anchor_spl::token::{transfer, Mint, Token, TokenAccount, Transfer};
use std::cmp::Ordering;

declare_id!("3twLVgxWB3fF6EkHGoNzH4ax8sH82fz2KZjgjwg4y7fs");

/// Max Outcomes any Pool Type can have. `Match Winner (1X2)` uses 3; the O/U types
/// (added in later tickets) use 2. Fixing the array at 3 lets those Pool Types be
/// added by appending a `PoolType` variant — no Pool account layout change.
pub const MAX_OUTCOMES: usize = 3;

/// TxLINE's on-chain program that owns the `daily_scores_roots` accounts. The trust
/// boundary of settlement: a score root is only honoured if its account owner is this
/// program (ADR-0008). MVP stand-in — set to TxLINE's real program at integration.
pub const TXLINE_PROGRAM_ID: Pubkey =
    anchor_lang::solana_program::pubkey!("FrcPceS49sTJp9R2Mp4fH4oxZ3bRRM1ggL13z72hDHmq");

/// `status` values inside a Score Proof leaf (ADR-0008).
pub const STATUS_FINALISED: u8 = 0;
pub const STATUS_ABANDONED: u8 = 1;

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
        pool.winning_outcome = None;
        pool.proven = ProvenStats::default();
        pool.score_root = [0u8; 32];
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

    /// Settle a Locked Pool trustlessly (ADR-0004): verify TxLINE's Merkle inclusion
    /// proof against its published root in-program, derive the winning Outcome from the
    /// fixed 1X2 predicate (ADR-0002), and record the proven stats for the Proof Receipt.
    /// Permissionless, once-only. A proof that does not verify moves nothing.
    pub fn settle(ctx: Context<Settle>, proof: ScoreProof) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        require!(pool.state == PoolState::Locked, FinalWhistleError::PoolNotLocked);

        // The trust boundary: read the root only from a TxLINE-owned account (ADR-0008).
        let score_root = read_scores_root(&ctx.accounts.scores_root)?;

        // The leaf is built from the POOL's fixture_id, not caller input, so a valid
        // proof for a different Fixture cannot settle this Pool.
        let leaf = compute_leaf(pool.fixture_id, &proof);
        require!(
            verify_inclusion(leaf, &proof.merkle_path, score_root),
            FinalWhistleError::ProofVerificationFailed
        );

        // Only a finalised Fixture has a winner here; abandoned routes to Void (T6).
        require!(proof.status == STATUS_FINALISED, FinalWhistleError::FixtureNotFinalised);

        // Fixed predicate per Pool Type (ADR-0002). Only MatchWinner is wired; guard so a
        // future O/U Pool cannot be silently settled with the 1X2 rule below.
        require!(pool.pool_type == PoolType::MatchWinner, FinalWhistleError::UnsupportedPoolType);

        // 1X2 predicate: home vs away goals -> 0 home win / 1 draw / 2 away win.
        let winning_outcome = match proof.home_goals.cmp(&proof.away_goals) {
            Ordering::Greater => 0u8,
            Ordering::Equal => 1u8,
            Ordering::Less => 2u8,
        };

        let proven = ProvenStats {
            home_goals: proof.home_goals,
            away_goals: proof.away_goals,
            home_corners: proof.home_corners,
            away_corners: proof.away_corners,
            home_cards: proof.home_cards,
            away_cards: proof.away_cards,
            status: proof.status,
        };
        pool.state = PoolState::Settled;
        pool.winning_outcome = Some(winning_outcome);
        pool.proven = proven;
        pool.score_root = score_root;

        // The Proof Receipt is rendered from this: winning Outcome, proven stats, the
        // root verified against, and the Merkle path (AC — via emitted event).
        emit!(PoolSettled {
            pool: pool.key(),
            fixture_id: pool.fixture_id,
            winning_outcome,
            proven,
            score_root,
            merkle_path: proof.merkle_path,
        });
        Ok(())
    }

    /// Claim a winning Entry's parimutuel payout from escrow (ADR-0003):
    /// `entry / winning_outcome_total * pot`, integer math rounded down — leftover dust
    /// stays in escrow. Claim-based so settlement is one bounded transaction regardless
    /// of Entry count; the Entry is closed on claim, so it cannot be claimed twice.
    pub fn claim_payout(ctx: Context<ClaimPayout>) -> Result<()> {
        let pool = &ctx.accounts.pool;
        require!(pool.state == PoolState::Settled, FinalWhistleError::PoolNotSettled);
        let winning_outcome = pool.winning_outcome.ok_or(FinalWhistleError::PoolNotSettled)?;

        let entry = &ctx.accounts.entry;
        require!(entry.outcome == winning_outcome, FinalWhistleError::NotWinningOutcome);

        // win_total >= entry.amount > 0, so the division cannot be by zero. Compute in
        // u128 to hold entry.amount * pot before dividing; the quotient fits in u64.
        let win_total = pool.outcome_totals[winning_outcome as usize];
        let payout = (entry.amount as u128)
            .checked_mul(pool.pot as u128)
            .ok_or(FinalWhistleError::Overflow)?
            .checked_div(win_total as u128)
            .ok_or(FinalWhistleError::Overflow)? as u64;

        // The escrow's authority is the Pool PDA; sign the withdrawal with its seeds.
        let group = pool.group;
        let (fixture, pool_type, nonce, bump) = pool.seed_parts();
        let seeds: &[&[u8]] = &[b"pool", group.as_ref(), &fixture, &pool_type, &nonce, &bump];

        transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.escrow.to_account_info(),
                    to: ctx.accounts.user_usdc.to_account_info(),
                    authority: ctx.accounts.pool.to_account_info(),
                },
                &[seeds],
            ),
            payout,
        )?;
        Ok(())
    }
}

/// keccak-256 leaf over the canonical, domain-separated finalised Fixture record (ADR-0008).
fn compute_leaf(fixture_id: u64, p: &ScoreProof) -> [u8; 32] {
    keccak::hashv(&[
        &[0x00u8],
        &fixture_id.to_le_bytes(),
        &[
            p.home_goals,
            p.away_goals,
            p.home_corners,
            p.away_corners,
            p.home_cards,
            p.away_cards,
            p.status,
        ],
    ])
    .0
}

/// keccak-256 internal node: domain-prefixed, sorted pair — so the proof carries no
/// direction bits (ADR-0008).
fn hash_node(a: &[u8; 32], b: &[u8; 32]) -> [u8; 32] {
    let (lo, hi) = if a <= b { (a, b) } else { (b, a) };
    keccak::hashv(&[&[0x01u8], lo, hi]).0
}

fn verify_inclusion(leaf: [u8; 32], path: &[[u8; 32]], root: [u8; 32]) -> bool {
    let mut node = leaf;
    for sibling in path {
        node = hash_node(&node, sibling);
    }
    node == root
}

/// Read TxLINE's 32-byte score root, honouring it only if the account is TxLINE-owned.
fn read_scores_root(acc: &UncheckedAccount) -> Result<[u8; 32]> {
    require_keys_eq!(*acc.owner, TXLINE_PROGRAM_ID, FinalWhistleError::InvalidScoresRoot);
    let data = acc.try_borrow_data()?;
    require!(data.len() >= 32, FinalWhistleError::InvalidScoresRoot);
    let mut root = [0u8; 32];
    root.copy_from_slice(&data[..32]);
    Ok(root)
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
    pub signer: Signer<'info>,
}

#[derive(Accounts)]
pub struct Settle<'info> {
    #[account(mut)]
    pub pool: Account<'info, Pool>,
    /// CHECK: TxLINE's `daily_scores_roots` account. Trust is enforced in the handler
    /// by requiring `owner == TXLINE_PROGRAM_ID` (ADR-0008); we only read the root bytes.
    pub scores_root: UncheckedAccount<'info>,
    /// Permissionless: any signer may settle (ADR-0004); identity is unchecked.
    pub signer: Signer<'info>,
}

#[derive(Accounts)]
pub struct ClaimPayout<'info> {
    pub pool: Account<'info, Pool>,
    /// The caller's Entry on the winning Outcome. Closed on a successful claim (rent to
    /// the User), which also prevents a second claim. Bound to this Pool and this User.
    #[account(
        mut,
        close = user,
        has_one = pool,
        has_one = user,
        seeds = [b"entry", pool.key().as_ref(), user.key().as_ref(), &[entry.outcome]],
        bump = entry.bump,
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
}

/// Proof Receipt inputs, emitted at settlement (ADR-0004 hero): the winning Outcome,
/// the proven team-level stats, the TxLINE root verified against, and the Merkle path.
#[event]
pub struct PoolSettled {
    pub pool: Pubkey,
    pub fixture_id: u64,
    pub winning_outcome: u8,
    pub proven: ProvenStats,
    pub score_root: [u8; 32],
    pub merkle_path: Vec<[u8; 32]>,
}

/// A TxLINE Score Proof: the finalised team-level stats plus the Merkle inclusion path
/// (leaf -> root) proving them against TxLINE's published root (ADR-0008).
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ScoreProof {
    pub home_goals: u8,
    pub away_goals: u8,
    pub home_corners: u8,
    pub away_corners: u8,
    pub home_cards: u8,
    pub away_cards: u8,
    pub status: u8,
    pub merkle_path: Vec<[u8; 32]>,
}

/// The proven team-level stats stored on a Settled Pool, for the Proof Receipt.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, InitSpace)]
pub struct ProvenStats {
    pub home_goals: u8,
    pub away_goals: u8,
    pub home_corners: u8,
    pub away_corners: u8,
    pub home_cards: u8,
    pub away_cards: u8,
    pub status: u8,
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
    /// Set at settlement (ADR-0004). `None` until Settled; the proven stats and the
    /// root are only meaningful once `state == Settled`.
    pub winning_outcome: Option<u8>,
    pub proven: ProvenStats,
    pub score_root: [u8; 32],
}

impl Pool {
    pub fn outcome_count(&self) -> usize {
        self.pool_type.outcome_count()
    }

    /// The variable byte parts of this Pool's PDA signer seeds (fixture_id, pool_type,
    /// nonce, bump), in seed order. Centralised so every escrow-signing site (claim,
    /// and refund in T6) encodes the fields identically to the CreatePool seeds. The
    /// caller prepends `b"pool"` and `group`, which own their own storage.
    pub fn seed_parts(&self) -> ([u8; 8], [u8; 1], [u8; 8], [u8; 1]) {
        (
            self.fixture_id.to_le_bytes(),
            [self.pool_type as u8],
            self.nonce.to_le_bytes(),
            [self.bump],
        )
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
    #[msg("Pool is not Locked")]
    PoolNotLocked,
    #[msg("Pool is not Settled")]
    PoolNotSettled,
    #[msg("Entry is not on the winning Outcome")]
    NotWinningOutcome,
    #[msg("Fixture kickoff time has not been reached")]
    BeforeKickoff,
    #[msg("Score Proof did not verify against TxLINE's published root")]
    ProofVerificationFailed,
    #[msg("Fixture is not finalised")]
    FixtureNotFinalised,
    #[msg("This Pool Type cannot be settled by the 1X2 predicate")]
    UnsupportedPoolType,
    #[msg("Scores root account is invalid or not owned by TxLINE")]
    InvalidScoresRoot,
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
