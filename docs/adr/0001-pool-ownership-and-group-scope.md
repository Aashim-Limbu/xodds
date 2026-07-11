# Pools are always owned by a Group; Global is a system Group

> **Amended by ADR-0007.** The "Global is a system Group of Pools" decision is superseded: the Global surface is now a P2P order-book market, not a Group of parimutuel Pools. The part below still holds for **friend Groups** (every friend-Group Pool is owned by a Group).

Every Pool belongs to exactly one Group rather than carrying a `public/private` visibility flag. The "global pool" is not a special case — it is a single system Group named **Global** that every user belongs to. We chose this over a visibility flag to keep one uniform Pool primitive with zero special-casing (`Pool.group` is always set).

Creation rights differ by Group: **members create their own Pools inside friend Groups** (the social "make your own market" feature), while **Global Pools are app-seeded, one per Fixture**. We deliberately do NOT let users create their own *public* Pools — that would fragment liquidity and invite spam, defeating the point of a shared high-liquidity Global Pool.
