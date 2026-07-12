# Product

## Register

product

## Platform

web

## Users

Mainstream football fans who want to bet on the 2026 World Cup with their friends for real money, and who are not crypto people. Their context is social and time-bound: a group chat's worth of mates around a fixture, deciding a call, watching the match, settling up. The job to be done is "put a few dollars on a match with my friends and know the payout is fair" — without a bookmaker taking a cut, without one friend playing banker, and without touching a seed phrase or a wallet. Success is a fan who signs in with email, backs an Outcome, and gets paid automatically, never once feeling like they're using "crypto."

There is a second surface with a second audience: a marketing/pitch landing that speaks to newcomers and hackathon judges rather than active players. That surface is brand register and is handled per task; this default carries the product (the app the fan is in a task on).

## Product Purpose

FinalWhistle is a social prediction app where friend Groups stake real USDC into shared parimutuel Pools on a match, watch it play out together, and get paid automatically when the result is proven. It exists because every option today forces a bad trade: bookmakers are a faceless house that sets the price and takes a cut; group chats and spreadsheets are social but settle on trust, with someone playing banker who can be wrong, slow, or dishonest. FinalWhistle removes the middleman on both axes — no house, no banker — and lets a Pool settle itself from a proof anyone can check. Success looks like friends coming back match after match because it's fun, fair, and effortless.

## Positioning

Nobody, including us, chose this outcome. Every Pool auto-settles on-chain from a TxLINE Score Proof, so the payout is decided by proven facts, not by the app, a bookmaker, or a friend.

## Brand Personality

Social-first and fun, with the energy of a group chat on matchday — casual, alive, a little irreverent, built for doing this with your mates rather than alone at a terminal. The reference feel is BeReal/Discord more than a betting site: playful and group-native. Under that playful surface sits something genuinely serious and trustworthy — real money, provable settlement — but the trust is carried by the payoff (the Proof Receipt as the hero moment: receipts, not a black box), not by making the whole app feel solemn. Fun on top, proof underneath.

## Anti-references

Not a cold trading terminal: no dense spreadsheet grids, no unfriendly data-wall, no making a fan feel like a quant. Not generic SaaS: no endless identical icon-and-heading cards with gradient accents, no template dashboard. The playful social register is the point; strangeness-without-purpose and corporate blandness both kill it.

## Design Principles

Crypto is invisible. A mainstream fan never sees a seed phrase, a hex address, or wallet jargon; the embedded wallet and the chain disappear behind email sign-in and plain dollars (ADR-0005). Any surfaced crypto artifact must earn its place by building trust, not by showing off.

Fun on top, proof underneath. The everyday surface — create, back an Outcome, chat in the Feed — is social and light. The trustless machinery is the substance, revealed at the moment it matters (settlement), never worn as a heavy, technical skin over the whole app.

The receipt is the hero. Settlement is a designed moment, not a status change. The Proof Receipt makes "nobody chose this" legible and independently verifiable to any Member, winner or loser — that reveal is the app's signature.

It is "bet with your friends," so the Group is first-class. The friend Group, the shared Feed, presence, and the invite link are core affordances, not afterthoughts; a Pool is something you do together.

Earn trust on every money move. Placing an Entry, claiming a payout, refunding a Void — real-USDC actions must feel standard and trustworthy, never a novel or surprising affordance. Familiarity is the feature where money changes hands.

## Accessibility & Inclusion

Target WCAG AA: body text and interactive controls meet AA contrast, and Pool state (Open / Locked / Settled / Void) is never signaled by color alone — it always carries a text label alongside the color. Honor prefers-reduced-motion with a crossfade or instant alternative for every animation, including the settlement reveal. Keyboard and screen-reader basics are complete on the money-path flows (create, enter, claim, refund).
