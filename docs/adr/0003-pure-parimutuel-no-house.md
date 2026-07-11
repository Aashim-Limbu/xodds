# Pools are pure parimutuel — no house, no locked price

> **Scope narrowed by ADR-0007.** This applies to **friend-Group Pools** only. The Global surface is a P2P fixed-odds market (Users lock a chosen price on matched Offers), not parimutuel.

An Entry does not lock a price. Payout is emergent: at settlement, the winning Outcome's backers split the whole pot in proportion to their Entries (`payout = your_entry / total_on_winning_outcome × pot`). We rejected a fixed-odds model because guaranteeing a price requires a house to fund lopsided pools, which carries directional risk and capital requirements we explicitly want to avoid. Parimutuel is always solvent (winners are paid only from losers' Entries) and needs no per-Entry price accounting.

Consequence: **TxLINE StablePrice odds are reference-only display (Reference Odds), never the settlement price.** They are an informational edge (spot a mispriced Pool), not a solvency dependency. A reader tempted to "wire the odds feed into pricing" should not — that reintroduces the house.
