# Keeper

The Keeper is a small, stateless bot that makes settlement feel automatic: it watches
Pools and, at the right moment, **Locks** them at kickoff, **Settles** them from a TxLINE
Score Proof at the final whistle, or **Voids** them if a Fixture never finalises. It holds
**no special authority** — everything it does is permissionless (ADR-0004), so a dead
Keeper never strands a Pool; anyone (including the app, or a human) can do the same calls.

## Run

```sh
# from the repo root
KEEPER_KEYPAIR=~/.config/solana/id.json \
KEEPER_RPC_URL=https://api.devnet.solana.com \
KEEPER_POLL_MS=15000 \
pnpm keeper
```

The keypair only pays transaction fees — fund it with a little devnet SOL.

## How it works

Each tick it re-reads **every Pool from chain** and, per Pool, takes the one action the
pure decision core (`decide.ts`) dictates:

| Pool state | Condition | Action |
|------------|-----------|--------|
| Open | `now ≥ kickoff` | `lock()` |
| Locked | TxLINE has a finalised **or** abandoned result | `settle(proof)` — the program routes an abandoned Fixture to Void |
| Locked | no result and `now ≥ kickoff + 6h` grace | `void_expired()` |
| Settled / Void | — | nothing (terminal) |

Because it derives all work from on-chain state every tick, it is **safe to restart**
(re-scans open work) and **never double-submits**: terminal Pools are skipped, and if it
loses a race the on-chain guards reject the call and it moves on.

The proof-building lives in `merkle.ts` — the **same** module the tests use, so the proofs
the Keeper submits are exactly the encoding `tests/txline.test.ts` pins to known vectors
and the on-chain program verifies (ADR-0008).

## TxLINE

`txline.ts` defines the `TxLineClient` the Keeper reads from and ships a `StandInTxLine`
with scripted results for the demo slate. `lock` and `void_expired` need nothing from
TxLINE and run fully against devnet. `settle` needs TxLINE's on-chain `daily_scores_roots`
account (the trust boundary). On devnet the Keeper re-anchors results under our own
`txline_mock` root (ADR-0008): right before `settle` it publishes the Fixture's score root
itself if the PDA doesn't exist yet — works for both the scripted stand-in and the real
TxLINE feed (`txline-live.ts`), no manual publish step. Real-feed roots are single-leaf
(root = leaf hash) so publish and settle can never drift apart across ticks.

## Tested

The decision core is unit-tested in `tests/keeper.test.ts` (`pnpm test`) — Lock timing,
settle-on-result, abandoned-via-settle, grace-window Void, result-beats-timeout, and
terminal-state idempotency.
