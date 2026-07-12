// The Keeper's decision core, kept pure so it can be unit-tested without a network.
// Given a Pool's state, the clock, and what TxLINE says about the Fixture, it returns the
// single permissionless action to take this tick. Everything it decides is callable by
// anyone (ADR-0004) — the Keeper is a convenience, not an authority.

export type PoolState = "open" | "locked" | "settled" | "void";

/** What TxLINE knows about a Fixture right now. `null` = not finalised yet. */
export type FixtureResult = { kind: "finalised" | "abandoned" } | null;

export type KeeperAction = "lock" | "settle" | "void_expired" | "none";

export const GRACE_SECONDS = 6 * 60 * 60; // must match GRACE_SECONDS on-chain

/**
 * Decide the next action for a Pool.
 * - Open: Lock once kickoff has passed.
 * - Locked: settle when TxLINE has a result AND its score root is available (finalised ->
 *   Settle/Void, abandoned -> Void, routed by the program). If it can't be settled and the
 *   grace window has elapsed, Void so funds are never stranded — even if a result exists
 *   but its root was never published.
 * - Settled / Void: terminal — never touched again (idempotent across restarts).
 *
 * `settleable` = TxLINE has published the on-chain score root this settle needs (defaults
 * true so a plain finalised result settles).
 */
export function decideAction(
  state: PoolState,
  kickoffTs: number,
  now: number,
  result: FixtureResult,
  settleable: boolean = true,
  graceSeconds: number = GRACE_SECONDS,
): KeeperAction {
  if (state === "open") {
    return now >= kickoffTs ? "lock" : "none";
  }
  if (state === "locked") {
    if (result && settleable) return "settle"; // finalised -> Settle/Void; abandoned -> Void
    if (now >= kickoffTs + graceSeconds) return "void_expired"; // fallback: never strand funds
    return "none";
  }
  return "none";
}
