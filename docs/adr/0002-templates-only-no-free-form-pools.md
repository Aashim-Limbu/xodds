# Pools are created from provable templates only — no free-form markets

Users cannot create free-form Pools (arbitrary questions). Every Pool must be one of a fixed set of **Pool Types** — `Match Winner (1X2)`, `Total Goals O/U`, `Total Corners O/U`, `Total Cards O/U` — each mapping to a predicate TxLINE can settle from team-level stats (goals, cards, corners per side).

This is deliberate despite "create your own market" being a social selling point. TxLINE cannot prove player props or subjective questions (e.g. first goalscorer, "was the ref biased"), so allowing free-form Pools would mean some Pools settle by trust/manual vote rather than proof — which destroys the app's core differentiator in the consumer track (that it is *not* trust-the-app). Templates-only guarantees the invariant **every Pool auto-settles with a Proof Receipt**, and is also less to build (fixed predicate per type, no dispute-resolution UI). Free-form Pools are a possible fast-follow after the hackathon.
