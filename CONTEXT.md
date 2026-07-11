# FinalWhistle

A social prediction app for the 2026 World Cup: friends (or the public) stake real USDC into shared parimutuel pools on match outcomes, watch the match play out live in-app off TxLINE's data feed, and get paid automatically when TxLINE-proven results settle the pool. Built for the TxODDS "Consumer & Fan Experiences" hackathon track.

## Language

**Pool**:
The **friend-Group** betting mechanic — a single parimutuel betting pool on one question about one Fixture, holding all staked USDC, split among the winners at settlement. Groups only; the Global surface uses the Global Market instead.
_Avoid_: Market (that's the Global surface), bet

**Fixture**:
A real match (e.g. Argentina vs Brazil). Reuses TxLINE's own term and fixtureId.
_Avoid_: Game, match

**Outcome**:
One selectable choice within a Pool (e.g. `Argentina win` / `Draw` / `Brazil win`; or `Over` / `Under` a Line).
_Avoid_: Selection, option, result

**Pool Type**:
The provable template a Pool is created from, each mapping to a fixed predicate TxLINE can settle. MVP set: `Match Winner (1X2)`, `Total Goals O/U`, `Total Corners O/U`, `Total Cards O/U`. There is no free-form Pool creation — every Pool is a Pool Type so every Pool auto-settles with a Proof Receipt.
_Avoid_: Template, market type, category

**Line**:
The numeric threshold for an over/under Pool Type (e.g. Total Goals O/U at 2.5). Set by the Pool's creator.
_Avoid_: Handicap, spread

**Reference Odds**:
TxLINE StablePrice (sharp-bookmaker consensus) odds shown alongside a Pool for information only. They never set the payout — a Pool is pure parimutuel, so the payout is emergent from the pool split. Used to reveal whether a Pool is mispriced versus the sharp market.
_Avoid_: Price, odds (unqualified), StablePrice (that's the upstream source name)

### Pool states

**Open**:
The Pool is accepting Entries; Reference Odds shown live. The only state in which money can enter.

**Locked**:
Reached at Fixture kickoff. No further Entries; the pot and each Outcome's totals are frozen. The match plays out live in-app off the TxLINE scores feed. There is no in-play betting.

**Settled**:
TxLINE has proven the result, the winning Outcome is set, the pot is paid to that Outcome's Entries, and the Proof Receipt is rendered. Terminal state.

**Void**:
Terminal state for a Pool that cannot settle to a paying Outcome, so every Entry is Refunded. Triggers: the winning Outcome has zero Entries; the Fixture is abandoned; or the Fixture fails to finalise within a grace window (config, ~6h) after scheduled kickoff, after which Void may be triggered permissionlessly.

**Refund**:
Returning an Entry's full USDC to its owner. Occurs only on Void. (No fee is taken on Refund.)

**Score Proof**:
TxLINE's Merkle proof of a Fixture's finalised team-level stats (goals, cards, corners per side, on the `game_finalised` record). Verified on-chain against TxLINE's published score root to determine a Pool's winning Outcome. The input to settlement.
_Avoid_: Oracle result, feed data

**Proof Receipt**:
The user-facing artifact proving a Pool settled honestly: the winning Outcome and its proven stat values, the TxLINE score root it verified against, the Merkle path, and the settlement transaction. The app's hero feature — "nobody, including us, chose this outcome."
_Avoid_: Receipt, proof (unqualified)

**Keeper**:
A bot (run by us) that submits a Score Proof to settle a Locked Pool at the final whistle. A convenience only — settlement is permissionless, so anyone can settle a Pool if the Keeper is down.
_Avoid_: Resolver, oracle, settler, cranker

**Feed**:
The per-Group social stream and the heart of the fan experience: auto-posted Fixture events (from the TxLINE scores stream), auto-posted Pool actions (Entry placed, Locked, Settled with Proof Receipt), plus free-form User messages, reactions, and live presence. Rich by design; built on a rented realtime layer, not hand-rolled. Excludes threads, DMs, and message search.
_Avoid_: Chat, timeline, activity log

**Entry**:
One user's USDC placed on one Outcome in a Pool. A Pool holds many Entries; a winning Outcome's Entries split the pot.
_Avoid_: Bet, stake, position, wager

**User**:
A person with an account and an app-managed, non-custodial embedded wallet (email/social sign-in, no seed phrase). The app actor.
_Avoid_: Player (reserved for footballers, though they are not modelled), account

**Member**:
A User who belongs to a given Group.
_Avoid_: Participant

**Group**:
A named set of member users that owns Pools. Every Pool belongs to exactly one Group. Members of a friend Group create their own Pools.
_Avoid_: Circle, room, club, team

**Global Market**:
The app-wide P2P order-book market — the public surface, NOT a Pool. Users post Offers on a Fixture's Outcomes; opposing Users Match them; matched stakes lock and settle by Score Proof. Distinct mechanic from friend-Group parimutuel Pools.
_Avoid_: Global pool, public pool

**Offer**:
A User's open, fully-collateralized proposed bet on the Global Market: an Outcome, a stake, and a price (the User sets it, pre-filled from Reference Odds). Rests in the order book until Matched (fully or partially); any unmatched remainder is refunded at kickoff.
_Avoid_: Order (use in "order book" only), bid, quote

**Match**:
When an opposing User takes an Offer (in full or in part), locking both stakes fully-collateralized. At settlement the Score Proof decides the winning Outcome and the winner takes the matched stakes.
_Avoid_: Fill, pairing
