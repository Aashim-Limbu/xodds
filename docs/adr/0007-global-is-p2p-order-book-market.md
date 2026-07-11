# The Global surface is a P2P order-book market, not a parimutuel Pool

The app now has two distinct betting mechanics by surface:
- **Friend Groups** keep parimutuel **Pools** (ADR-0003) — self-funding, works with only a few people.
- **Global** is a **P2P order-book market**: a User posts an **Offer** (Outcome + stake + a price they set, pre-filled from Reference Odds); an opposing User **Matches** it (fully or partially, fully collateralized); matched stakes lock; unmatched remainder refunds at kickoff. Winner (per Score Proof) takes the matched stakes.

This supersedes ADR-0001's "Global is a system Group of Pools" and narrows ADR-0003 to friend Groups. Rationale: parimutuel suits small groups but the liquid Global surface benefits from a real exchange — Users get **fixed, chosen odds** and the "you think I'm wrong? take the other side" dynamic, and P2P's counterparty-matching weakness is covered by Global's scale. Settlement is unchanged: the Score Proof still decides the winner and the Proof Receipt still renders, so the hero is untouched — only market formation differs.

Cost accepted (chosen deliberately over a thinner 1v1 "Challenge" model): a full order book means matching logic, partial fills, and offer cancellation/refund — net-new build that competes with the rich-chat and settlement pillars in the 2-week window. Vertical-slice-first discipline (ADR-0006) becomes mandatory; if the clock runs out, the order book degrades to whole-offer 1v1 matching before either other pillar is cut.
