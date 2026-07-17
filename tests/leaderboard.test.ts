import { describe, expect, it } from "vitest";
import { computeStandings, winStreak, type PoolResult } from "../app/lib/leaderboard.js";

// A settled-Pool result for one user: what they staked in that Pool and what they got back.
const r = (wallet: string, staked: number, won: number, ts: number, name = wallet): PoolResult => ({
  pool: `pool-${ts}`,
  wallet,
  name,
  staked: BigInt(staked),
  won: BigInt(won),
  ts,
});

describe("winStreak", () => {
  it("counts leading consecutive net-positive results, most-recent first", () => {
    // chronological: loss, win, win, win  -> current streak 3
    expect(winStreak([r("a", 5, 0, 1), r("a", 5, 8, 2), r("a", 5, 9, 3), r("a", 5, 10, 4)])).toBe(3);
  });
  it("breaks the streak on a loss", () => {
    expect(winStreak([r("a", 5, 10, 1), r("a", 5, 0, 2)])).toBe(0);
  });
  it("treats a break-even (won == staked) as not a win", () => {
    expect(winStreak([r("a", 5, 5, 1)])).toBe(0);
  });
  it("is 0 for no results", () => {
    expect(winStreak([])).toBe(0);
  });
});

describe("computeStandings", () => {
  const rows: PoolResult[] = [
    r("alice", 10, 25, 1, "Alice"), // +15 win
    r("bob", 10, 0, 1, "Bob"), //     -10 loss
    r("alice", 10, 18, 2, "Alice"), // +8 win  -> alice streak 2
    r("bob", 5, 12, 2, "Bob"), //     +7 win
  ];

  it("aggregates net, wins, plays per wallet and ranks by net desc", () => {
    const s = computeStandings(rows);
    expect(s.map((x) => x.wallet)).toEqual(["alice", "bob"]);
    expect(s[0]).toMatchObject({ name: "Alice", plays: 2, wins: 2, net: 23n, streak: 2 });
    expect(s[1]).toMatchObject({ name: "Bob", plays: 2, wins: 1, net: -3n, streak: 1 });
  });

  it("uses the latest display name for a wallet", () => {
    const s = computeStandings([r("w", 5, 9, 1, "Old"), r("w", 5, 9, 2, "New")]);
    expect(s[0].name).toBe("New");
  });

  it("dedupes a result reported twice for the same (pool, wallet)", () => {
    const dup = r("w", 10, 20, 1);
    expect(computeStandings([dup, dup])[0]).toMatchObject({ plays: 1, net: 10n });
  });

  it("breaks a net tie by more wins", () => {
    const s = computeStandings([r("x", 10, 20, 1), r("y", 100, 110, 1), r("y", 0, 0, 2)]);
    // both net +10; x has 1 win / 1 play, y has 1 win / 2 plays -> x first (fewer plays, same wins)
    expect(s[0].wallet).toBe("x");
  });

  it("is empty for no results", () => {
    expect(computeStandings([])).toEqual([]);
  });
});
