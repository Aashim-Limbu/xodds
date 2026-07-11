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
 * - Locked: settle when TxLINE has a result (finalised OR abandoned — the program routes
 *   an abandoned Fixture to Void); otherwise Void once the grace window elapses.
 * - Settled / Void: terminal — never touched again (idempotent across restarts).
 */
export function decideAction(
  state: PoolState,
  kickoffTs: number,
  now: number,
  result: FixtureResult,
  graceSeconds: number = GRACE_SECONDS,
): KeeperAction {
  if (state === "open") {
    return now >= kickoffTs ? "lock" : "none";
  }
  if (state === "locked") {
    if (result) return "settle"; // finalised -> Settle/Void; abandoned -> Void (routed by settle)
    if (now >= kickoffTs + graceSeconds) return "void_expired";
    return "none";
  }
  return "none";
}
