# Matches: grouping market Pools under one Fixture

**Date:** 2026-07-19
**Status:** Approved, not yet implemented
**Scope:** Client-side only. No Anchor program changes, no redeploy, no migration.

## Problem

Creating a Pool forces the creator to pick one market, and the picker defaults to
Match Winner (1X2). The Pools grid then renders one flat card per Pool, so four markets on
the same match appear as four unrelated cards with no indication they belong together. A fan
who wants to back the scoreline *and* the corners has no path that reads as one match.

## What was verified first

These are observed facts, not assumptions. They are what makes the design cheap.

**On-chain (`programs/finalwhistle/src/lib.rs`)**

- Pool PDA seeds are `[b"pool", group, fixture_id, pool_type, nonce]` (lib.rs:346-360).
  `pool_type` is part of the address, so **several market Pools already coexist on one
  Fixture in one Group**. Nothing needs to change for that.
- `settle()` already decides all four market types from a single proof (lib.rs:158-170), and
  `ProvenStats` carries goals, corners and cards for both sides — one Score Proof settles
  every market on the Fixture.
- Packing markets into a *single* Pool account is structurally impossible:
  `winning_outcome: Option<u8>` is one value for the account (lib.rs:570); `pot: u64` and
  `outcome_totals: [u64; 3]` are one shared pot, and the payout
  `entry / outcome_totals[winning] * pot` (lib.rs:262) breaks if markets share it; the
  `Entry` PDA `[b"entry", pool, user, outcome]` (lib.rs:391) collides across markets.
- **`line_x2` is NOT in the seeds.** Two Pools of the same type and line are distinguished
  only by `nonce`. This is the source of the race in "Failure modes" below.

**TxLINE API (probed live against `txline-dev.txodds.com`)**

- Odds exist for exactly three market types: `1X2_PARTICIPANT_RESULT`,
  `ASIANHANDICAP_PARTICIPANT_GOALS`, `OVERUNDER_PARTICIPANT_GOALS`. Only one fixture in the
  snapshot had odds at all; every other returned `[]`.
- **No corners or cards odds exist.** Those markets settle from *stats*, not odds — stat keys
  `1`/`2` (goals) and `7`/`8` (corners) confirmed against a finalised fixture's own `Score`
  object. Card keys `3`-`6` were all zero in the observed match: unverified, not refuted.
- The published OpenAPI spec types `SuperOddsType` as a bare string with no enum and does not
  document stat keys at all. The app's stat map is reverse-engineered and empirically
  confirmed, not contractual — it can change without notice.

## Domain language

A **Pool** stays what `CONTEXT.md:7` and the program say it is: one parimutuel pool on one
question. The container is new and is called a **Match**.

- **Match** — Spain vs Argentina, in your Group. The page, the Room, the receipt.
- **Pool** — one market on that Match. What you back. Unchanged everywhere.

Redefining "Pool" as the container was rejected: it would put the UI at odds with the program,
the ADRs, and the Proof Receipt's own wording.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| When market Pools are created | **Lazily**, on first back | Creator would otherwise fund up to 4 accounts + 4 escrows, most unused |
| O/U lines | **Multiple lines may coexist** per market | Chosen for flexibility; density mitigated below |
| Page structure | **One Match page, one Room, markets stacked inline** | Keeps chat in one place; backing 3 markets never leaves the page |
| Settlement | **One Proof Receipt** with per-market result rows | All markets settle from the *same* proof; four receipts would repeat one proof four times |

**Density mitigation** (PRODUCT.md names the trading terminal as an anti-reference): a market
shows lines that hold money, plus one suggested line. Further lines sit behind an
"open another line" affordance rather than a full ladder.

## Components

| Piece | Role |
|---|---|
| `lib/markets.ts` *(new)* | Market catalogue: 4 types, labels, default lines (goals from TxLINE; corners 9.5, cards 4.5 fixed), whether odds exist. Plus `groupByFixture(pools) -> Match[]`. Pure, unit-testable. |
| `MatchCard` | Replaces the per-Pool grid card. Fixture, **aggregate** pot across markets, market count, participants. |
| `MatchView` | Match page: banner + stacked `MarketSection`s + one Room. |
| `MarketSection` | One Pool's outcomes + backing. Extracted from today's `PoolView` outcome grid so the backing path is existing code. |
| `MatchReceipt` | One proof, per-market result rows. Wraps `ProofReceipt`'s existing verification — the crypto is not rewritten. |

**Routing:** new `/match/<group>/<fixtureId>`. Existing `/pool/<addr>` and `/receipt/<addr>`
keep working — the receipt share link is the hero artifact and live links must not break.

**The Room** moves from channel `pool:<address>` to `fixture:<group>:<fixtureId>`. Chat on
existing Pools is not deleted, but is not shown on the new Match page.

## How a Match comes into existence

A Match is **derived**, not stored. It has no account, no row, no id of its own — it is just
`(group, fixture_id)` plus whichever Pools currently exist under it. With lazy creation, a
Match nobody has backed yet has **zero** on-chain footprint.

That has a consequence worth stating plainly, because it is the point of this change:

- **`CreatePoolModal` goes away.** There is no "create a Pool, now pick a market" step, which
  is the prompt this design exists to remove. Picking a Fixture in the game browser navigates
  straight to its Match page, where every market is listed and any of them can be backed.
- The **Pools grid lists Matches that have at least one Pool** — i.e. matches somebody has
  money on. An unbacked Match is not "missing"; it lives in the game browser until it has a
  stake, then appears in the grid.
- The existing OPEN / SETTLED filter applies at Match level. A Match counts as open if any of
  its Pools is open, and settled once all of its Pools have settled or voided.

**Do not drop the Fixture name-book write with it.** `CreatePoolModal` currently calls
`recordFixture` (`lib/groups.ts`) immediately after `createPool`, and that write is the only
thing that lets a settled Pool name its teams — TxLINE's fixtures snapshot lists **upcoming
matches only**, so once a match kicks off its team names are unrecoverable upstream and every
receipt degrades to "Away win". When the modal is removed, `recordFixture` must move onto the
lazy-create path, so the Fixture is still recorded the first time any market Pool is opened.
It stays best-effort and fire-and-forget: a Pool that exists on-chain must never fail on a
social-layer write.

## Data flow: backing an unopened market

```
tap "Back $5" on an empty market
  -> re-scan group Pools for (fixtureId, poolType, lineX2)
       found     -> enter that Pool                 (1 tx)
       not found -> freeNonce -> createPool -> enter (2 tx)
```

## Failure modes

**Concurrent open (the race).** Two people back the same empty market at once. Both scan,
both see nothing, both call `freeNonce` and get the same nonce; one transaction fails with
"account in use". A naive retry increments the nonce and creates a **second Pool on the same
line**, silently splitting the pot.

The retry must **not** increment. On that failure, re-scan and join the Pool that now exists,
collapsing the race into a join. This is the one piece of logic that must be unit-tested.

**Pre-existing duplicates.** Where two Pools share a (type, line) anyway — from the race, or
from before this change — the UI shows both rows. Money must never be invisible because two
Pools share a line.

**Partial failure.** If `createPool` succeeds and `enter` fails, the market exists with $0 and
the user has **not** been charged. The message says exactly that ("Market opened — your $5
wasn't taken, try again"), because the dangerous outcome is someone believing they hold a bet
they do not. The market then renders as open-with-$0, not "be first to back", so a retry does
not attempt a second create.

**Partial settlement.** The keeper settles each Pool independently, so markets can settle at
different moments. `MatchReceipt` renders per-market state honestly — settled / void / still
pending — and does not present the Match as fully PROVEN while a market is outstanding. Void
markets keep their existing reason and refund path.

Locking needs no special handling: all markets share the Fixture kickoff and lock together.

## Testing

Vitest, existing setup. No new framework.

- `groupByFixture` — grouping, aggregate pot, mixed states
- market catalogue — default lines, which markets carry odds
- **find-or-join** — returns the existing Pool rather than creating a duplicate
- The program is untouched, so the existing 109 tests still cover settle / claim / void

## Accessibility

Each market is a labelled section. Pool state keeps its text label and is never signalled by
colour alone. "Be first to back" is a real button and keyboard-reachable.

## Out of scope

**Spread / Asian handicap.** TxLINE publishes it, but it needs a new `PoolType` variant, a
program change and a redeploy. It also breaks an existing invariant: `create_pool` requires
`line_x2` to be odd (lib.rs:50-56) specifically so a push is arithmetically impossible, and
the observed handicap lines are quarter-lines (±0.25, ±1.25) that half-win. Supporting them
means splitting a stake across two results, which the parimutuel payout does not do. Its own
design.

**Per-period markets.** Stats arrive in 8 period scopes (full match, H1, HT, H2, plus four
unobserved). The app uses only full-match. A free axis for future markets; not in this change.

## Known trade-off

The first back on each market is a two-transaction action — slower and less familiar than
today's single `enter`, which sits against PRODUCT.md's "earn trust on every money move".
Accepted to avoid the creator funding four escrows; the copy in "Partial failure" is the
mitigation. If it proves too rough, the fallback is opening the 1X2 Pool eagerly at Match
creation (the market everyone backs anyway) and keeping the rest lazy.
