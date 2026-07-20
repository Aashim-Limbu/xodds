import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { MARKETS, marketLabel, marketLines, lineMenu, groupByFixture } from "../app/lib/markets.js";

const G = new PublicKey("11111111111111111111111111111111");

// Minimal PoolAccount stand-in — groupByFixture only reads these fields.
function pool(over: Partial<Record<string, unknown>> = {}) {
  return {
    address: PublicKey.unique(),
    group: G,
    fixtureId: 1002n,
    poolType: "matchWinner",
    lineX2: 0,
    state: "open",
    pot: 5_000_000n,
    ...over,
  } as never;
}

describe("MARKETS", () => {
  it("offers only the markets TxLINE actually quotes", () => {
    // Corners and Cards are deliberately absent: their stat keys have never appeared in a
    // live payload, and finalisedFeedLines reads a missing key as 0 — so every such Pool
    // would settle "Under" with no error. The PoolType variants stay in the program.
    expect(MARKETS.map((m) => m.poolType)).toEqual(["matchWinner", "totalGoals", "handicap"]);
  });

  it("keeps every fallback Line odd so a push is impossible", () => {
    // create_pool requires line_x2.rem_euclid(2) == 1 (lib.rs). rem_euclid, not %, because
    // Handicap lines are negative and (-1) % 2 === -1 in JS.
    for (const m of MARKETS.filter((m) => m.hasLine)) {
      expect(m.fallbackLinesX2.length).toBeGreaterThan(0);
      for (const l of m.fallbackLinesX2) expect(((l % 2) + 2) % 2).toBe(1);
    }
  });
});

describe("marketLines", () => {
  it("prefers the Lines TxLINE quotes", () => {
    const goals = MARKETS.find((m) => m.poolType === "totalGoals")!;
    expect(marketLines(goals, { goalLines: [7, 9] })).toEqual([7, 9]);
  });

  it("falls back while the feed is still warming up", () => {
    const goals = MARKETS.find((m) => m.poolType === "totalGoals")!;
    expect(marketLines(goals, {})).toEqual(goals.fallbackLinesX2);
    expect(marketLines(goals, { goalLines: [] })).toEqual(goals.fallbackLinesX2);
  });
});

describe("marketLabel", () => {
  it("names the 1X2 market without a line", () => {
    expect(marketLabel("matchWinner", 0)).toBe("Match Winner");
  });

  it("renders an O/U line as a half-integer", () => {
    expect(marketLabel("totalGoals", 5)).toBe("Total Goals O/U 2.5");
  });

  it("signs a Handicap line, so it says which side gives goals away", () => {
    expect(marketLabel("handicap", 1)).toBe("Handicap +0.5");
    expect(marketLabel("handicap", -3)).toBe("Handicap -1.5");
  });

  it("still labels a RETIRED market, so an old Pool's money stays readable", () => {
    // A settled Corners Pool must keep a legible receipt and claim page even though the
    // market is no longer offered. An unlabelled row is money the owner cannot find.
    expect(marketLabel("totalCorners", 19)).toBe("Total Corners O/U 9.5");
    expect(marketLabel("totalCards", 9)).toBe("Total Cards O/U 4.5");
  });
});

describe("groupByFixture", () => {
  it("groups pools of the same fixture into one Match and sums the pot", () => {
    const ms = groupByFixture([
      pool({ poolType: "matchWinner", pot: 45_000_000n }),
      pool({ poolType: "totalGoals", lineX2: 5, pot: 10_000_000n }),
    ]);
    expect(ms).toHaveLength(1);
    expect(ms[0].fixtureId).toBe(1002n);
    expect(ms[0].pools).toHaveLength(2);
    expect(ms[0].pot).toBe(55_000_000n);
  });

  it("keeps different fixtures apart", () => {
    const ms = groupByFixture([pool({ fixtureId: 1n }), pool({ fixtureId: 2n })]);
    expect(ms).toHaveLength(2);
  });

  it("is open while any pool is open", () => {
    const ms = groupByFixture([
      pool({ state: "settled" }),
      pool({ poolType: "totalGoals", state: "open" }),
    ]);
    expect(ms[0].state).toBe("open");
  });

  it("is settled only once every pool has settled or voided", () => {
    const ms = groupByFixture([
      pool({ state: "settled" }),
      pool({ poolType: "totalGoals", state: "void" }),
    ]);
    expect(ms[0].state).toBe("settled");
  });

  it("is void when every pool voided", () => {
    const ms = groupByFixture([
      pool({ state: "void" }),
      pool({ poolType: "totalGoals", state: "void" }),
    ]);
    expect(ms[0].state).toBe("void");
  });
});

describe("lineMenu", () => {
  const goals = MARKETS.find((m) => m.poolType === "totalGoals")!;
  const hcap = MARKETS.find((m) => m.poolType === "handicap")!;
  const winner = MARKETS.find((m) => m.poolType === "matchWinner")!;

  it("offers a standard spread even when the feed quotes nothing", () => {
    // The devnet feed quoted zero usable full-match goal lines, so a quote-only menu would
    // strand a Group on the fallbacks. The program settles any odd line×2.
    expect(lineMenu(goals, [], [])).toEqual([1, 3, 5, 7, 9, 11, 13]);
  });

  it("keeps a Line that already holds money, even outside the standard range", () => {
    // Money must never become unreachable because a Line fell out of the menu.
    expect(lineMenu(goals, [], [21])).toContain(21);
  });

  it("folds feed-quoted Lines in without duplicating them", () => {
    const menu = lineMenu(goals, [5, 15], []);
    expect(menu.filter((l) => l === 5)).toHaveLength(1);
    expect(menu).toContain(15);
  });

  it("drops any Line that cannot settle honestly", () => {
    // Even line×2 = a whole line = a push, which the pot cannot pay.
    expect(lineMenu(goals, [4, 6], [8])).not.toContain(4);
    expect(lineMenu(goals, [4, 6], [8])).not.toContain(8);
  });

  it("spans both sides for Handicap and never offers 0", () => {
    const menu = lineMenu(hcap, [], []);
    expect(menu[0]).toBeLessThan(0);
    expect(menu[menu.length - 1]).toBeGreaterThan(0);
    expect(menu).not.toContain(0);
  });

  it("gives a lineless market a single no-op entry", () => {
    expect(lineMenu(winner, [], [])).toEqual([0]);
  });
});
