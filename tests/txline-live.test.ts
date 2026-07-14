import { describe, expect, it } from "vitest";
import { parseFinalisedStats, type TxScores } from "../keeper/txline-live.js";
import { STATUS_ABANDONED, STATUS_FINALISED } from "../keeper/merkle.js";

// Pins the TxLINE finalised-record -> FixtureStats mapping (keeper/txline-live.ts). If the
// real feed's stat-key strings differ, fix them in the K map there and update this vector.

const finalised: TxScores[] = [
  { fixtureId: 42, action: "in_play", participant1IsHome: true, stats: {} }, // live noise, ignored
  {
    fixtureId: 42,
    action: "game_finalised",
    participant1IsHome: true,
    // p1: 2 goals, 1 yellow + 1 red = 2 cards, 6 corners; p2: 1 goal, 3 yellow + 0 red = 3 cards, 4 corners
    stats: { "1": 2, "2": 1, "3": 1, "4": 3, "5": 1, "6": 0, "7": 6, "8": 4 },
  },
];

describe("parseFinalisedStats", () => {
  it("maps a finalised record with participant1 at home", () => {
    expect(parseFinalisedStats(42n, finalised)).toEqual({
      fixtureId: 42n,
      homeGoals: 2, awayGoals: 1,
      homeCorners: 6, awayCorners: 4,
      homeCards: 2, awayCards: 3,
      status: STATUS_FINALISED,
    });
  });

  it("swaps home/away when participant1 is away", () => {
    const away = [{ ...finalised[1], participant1IsHome: false }];
    const r = parseFinalisedStats(42n, away)!;
    expect([r.homeGoals, r.awayGoals]).toEqual([1, 2]);
    expect([r.homeCards, r.awayCards]).toEqual([3, 2]);
  });

  it("returns null while the match is still live", () => {
    expect(parseFinalisedStats(42n, [finalised[0]])).toBeNull();
  });

  it("flags an abandoned match via statusSoccerId", () => {
    const abandoned: TxScores[] = [{ fixtureId: 42, action: "in_play", participant1IsHome: true, statusSoccerId: 15, stats: {} }];
    expect(parseFinalisedStats(42n, abandoned)?.status).toBe(STATUS_ABANDONED);
  });
});
