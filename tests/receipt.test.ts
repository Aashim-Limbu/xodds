import { describe, expect, it } from "vitest";
import { receiptSummary } from "../app/lib/receipt.js";
import type { Fixture } from "../app/lib/fixtures.js";

const fixture: Fixture = {
  fixtureId: 1001n,
  home: "Argentina",
  away: "Brazil",
  kickoff: 0,
  referenceProbabilities: [0.4, 0.3, 0.3],
};

describe("receiptSummary", () => {
  it("summarises a 1X2 home win with the fixture names", () => {
    const s = receiptSummary(1001n, "matchWinner", 0, { homeGoals: 2, awayGoals: 1 }, 0, fixture);
    expect(s).toEqual({
      matchup: "Argentina vs Brazil",
      score: "2–1",
      outcome: "Argentina win",
      headline: "ARGENTINA WIN",
    });
  });

  it("summarises a Total Goals Over win", () => {
    const s = receiptSummary(1001n, "totalGoals", 5, { homeGoals: 2, awayGoals: 1 }, 0, fixture);
    expect(s.outcome).toBe("Over 2.5");
    expect(s.headline).toBe("OVER 2.5");
  });

  it("falls back to Fixture id when the fixture is unknown", () => {
    const s = receiptSummary(9999n, "matchWinner", 0, { homeGoals: 0, awayGoals: 0 }, 1);
    expect(s.matchup).toBe("Fixture 9999");
    expect(s.outcome).toBe("Draw");
  });
});
