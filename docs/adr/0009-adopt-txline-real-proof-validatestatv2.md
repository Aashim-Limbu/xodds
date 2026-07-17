# Settlement adopts TxLINE's real proof (`validateStatV2`), superseding our own scheme

_Status: Proposed. Supersedes [ADR-0008](./0008-score-proof-merkle-scheme.md); revisits alternative (1) of [ADR-0004](./0004-in-program-merkle-verification-permissionless-settlement.md). Recommended for post-hackathon; the hackathon build stays on ADR-0008._

## Context

ADR-0008 defined our **own** Merkle scheme because TxLINE's real `daily_scores_roots` leaf encoding "was not available to us when building the slice." It is available now. Integrating the World Cup free tier (devnet) surfaced the real shapes, and they differ from ours on every axis:

| | Ours (ADR-0008) | Real TxLINE |
|---|---|---|
| Tree | single-level, sorted-pair keccak | hierarchical: event sub-tree → fixture → main tree |
| Leaf | one 7-byte team-stat blob per Fixture | one leaf **per stat**, keyed by `statKey` |
| Root account | per-Fixture PDA `["root", fixture_id]`, owned by our `txline_mock` | **per-day** PDA `["daily_scores_roots", epochDay u16 LE]` |
| Verifier | our `compute_leaf`/`verify_inclusion` | TxLINE's `validateStatV2` |
| Program | `txline_mock` (we publish the root) | `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J` (devnet) · `9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA` (mainnet) |

For the hackathon we bridge the gap by reading real finalised stats and **re-anchoring** them under our own root (`keeper/publish-roots.ts`). That is coherent and end-to-end runnable, but the Proof Receipt's honesty claim is weaker than it should be: *we* publish the root we verify against. Full trustlessness — "nobody, including us, owns this root" — requires verifying against TxLINE's own published `daily_scores_roots`, which our `settle` does not do.

The blocker in ADR-0004's rejection of "CPI into TxLINE's program" was explicit: *"the program name/IDL could not be confirmed, so building on it blind is a demo-day risk."* Both are now confirmed. That fact, not a change of principle, is what reopens the decision.

## Decision

Rewrite `settle` to verify against TxLINE's real `daily_scores_roots`, via **CPI into `validateStatV2`**, and retire our own scheme and the `txline_mock` publisher.

The trust model is a clean fit for ADR-0004's philosophy: **a non-reverting `validateStatV2` CPI is the proof.** We do not need to parse return data — if the stat's Merkle inclusion against the day's on-chain root does not hold, the CPI reverts, the whole `settle` transaction reverts, and the Pool stays Locked (the grace-window Void still protects funds, ADR-0004). Settlement pays out only on a call TxLINE's own program accepted. Nobody, including us, can forge that.

Pool Types map to `validateStatV2` predicates over indexed `statKeys` (full-match prefix `0`):

- **Match Winner (1X2)** — `statKeys=1,2` (p1/p2 goals); predicate on `stat[0] − stat[1]` (`>0` / `=0` / `<0`).
- **Total Goals O/U** — `statKeys=1,2`; `stat[0] + stat[1]` vs the Line.
- **Total Corners O/U** — `statKeys=7,8`; sum vs Line.
- **Total Cards O/U** — `statKeys=3,4,5,6` (yellows + reds); sum vs Line.

`settle` derives `epochDay` from the proof's finalised timestamp (u16 LE) to select the day's root PDA, and binds `pool.fixture_id` into the CPI accounts so a proof for another Fixture cannot settle this Pool (the property ADR-0008's `fixture_id`-in-leaf gave us, preserved).

## Alternatives rejected

1. **Re-implement TxLINE's hierarchical tree walk in our own program** (as we did for our own scheme). Keeps `settle` self-contained with no runtime dependency on TxLINE's program being invocable. Rejected as the *default* because it means tracking TxLINE's exact leaf/node encoding across their upgrades in our Rust — more code and a standing maintenance tax — for no extra safety over "the oracle's own program accepted the proof." **Kept as the fallback** if `validateStatV2` proves view-only (always reverts under `invoke`) or exceeds the compute budget.
2. **Keep ADR-0008 and re-anchor real stats under our root** (the hackathon bridge). Rejected long-term: our server owning the verified root is precisely the trust we sell against.
3. **Trusted off-chain resolver.** Rejected again for the same reason as ADR-0004 — it makes us the party that decides the winner.

## Consequences

- **Removed:** `programs/txline_mock`, `keeper/publish-roots.ts`, our `compute_leaf`/`hash_node`/`verify_inclusion` in `finalwhistle`, and the mirrored TS in `keeper/merkle.ts` + `app/lib/proof.ts`. `TXLINE_PROGRAM_ID` becomes TxLINE's real program.
- **Changed:** `settle` takes TxLINE's `validateStatV2` payload (`fixtureSummary`, `eventStatRoot`, `subTreeProof`, `mainTreeProof`, `stats[]`) instead of our flat `ScoreProof`, plus the `daily_scores_roots` account and TxLINE's program as CPI targets. The `ProofReceipt` renders TxLINE's real root + Merkle path — a stronger receipt.
- **Keeper:** fetches the real proof from `GET /api/scores/stat-validation?fixtureId=&seq=&statKeys=` (per `RealTxLine`), maps it to the CPI payload, and submits `settle`. It reads TxLINE's root instead of publishing one. `scoresRootAccount()` returns the day PDA under TxLINE's program.
- **Void unchanged:** the abandoned and grace-window paths (ADR-0004) still hold; abandonment is a `statusId`/`action` TxLINE finalises, provable the same way.
- **Risk to confirm before committing:** (a) `validateStatV2` succeeds under CPI `invoke` (not view-only); (b) it fits the compute budget alongside the payout logic (ADR-0004 measured our own walk within 1.4M CU — TxLINE's is deeper); (c) the exact account list + arg layout from the devnet IDL. If (a) or (b) fails, take alternative (1).
- **Compute-budget note:** a `validateStatV2` CPI plus the parimutuel payout may exceed one transaction's CU. If so, split settlement into `verify` (CPI, records a verified flag on the Pool) then `settle` (pays out) — two permissionless calls, same trust boundary.
