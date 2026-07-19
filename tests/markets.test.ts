import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { MARKETS, marketLabel, groupByFixture } from "../app/lib/markets.js";

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
  it("covers the four on-chain pool types and no others", () => {
    expect(MARKETS.map((m) => m.poolType)).toEqual([
      "matchWinner", "totalGoals", "totalCorners", "totalCards",
    ]);
  });

  it("marks corners and cards as having no TxLINE odds", () => {
    // Verified against the live API: odds exist only for 1X2 and O/U goals.
    const byType = Object.fromEntries(MARKETS.map((m) => [m.poolType, m]));
    expect(byType.matchWinner.hasOdds).toBe(true);
    expect(byType.totalGoals.hasOdds).toBe(true);
    expect(byType.totalCorners.hasOdds).toBe(false);
    expect(byType.totalCards.hasOdds).toBe(false);
  });

  it("uses odd default lines so a push is impossible", () => {
    // create_pool rejects an even line_x2 (lib.rs:50-56).
    for (const m of MARKETS.filter((m) => m.hasLine)) {
      expect(m.defaultLineX2 % 2).toBe(1);
    }
  });
});

describe("marketLabel", () => {
  it("names the 1X2 market without a line", () => {
    expect(marketLabel("matchWinner", 0)).toBe("Match Winner");
  });

  it("renders the line as a half-integer", () => {
    expect(marketLabel("totalGoals", 5)).toBe("Total Goals O/U 2.5");
    expect(marketLabel("totalCorners", 19)).toBe("Total Corners O/U 9.5");
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
