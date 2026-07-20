import { beforeEach, describe, expect, it, vi } from "vitest";

// A settled Pool's Fixture has already dropped out of TxLINE's upcoming snapshot, so the only
// thing that can name the match on the Proof Receipt is the seen-Fixtures cache. If this
// round-trip breaks, every settled Pool silently degrades to "Away win" — no error, no crash.

const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
});

const real = [{ fixtureId: "9001", home: "Spain", away: "Germany", kickoff: 1_700_000_000 }];

describe("seen-Fixtures cache", () => {
  beforeEach(() => store.clear());

  it("resolves a Fixture that is no longer in the upcoming snapshot", async () => {
    vi.resetModules();
    const first = await import("../app/lib/fixtures.js");
    first.hydrateFixtures(real); // seen while the Pool was Open — persists

    // A later visit: fresh module (empty in-memory slate), and TxLINE no longer lists it.
    vi.resetModules();
    const next = await import("../app/lib/fixtures.js");
    expect(next.fixtureById(9001n)).toBeUndefined(); // nothing restored yet
    next.restoreSeenFixtures();

    expect(next.fixtureById(9001n)).toMatchObject({ home: "Spain", away: "Germany" });
    // The payoff: real team names on the receipt instead of the generic fallback.
    expect(next.poolOutcomeLabels("matchWinner", 0, next.fixtureById(9001n))).toEqual([
      "Spain win",
      "Draw",
      "Germany win",
    ]);
  });

  it("survives a corrupt cache without taking the static slate down", async () => {
    vi.resetModules();
    store.set("xodds.fixtures.seen", "{not json");
    const mod = await import("../app/lib/fixtures.js");
    expect(() => mod.restoreSeenFixtures()).not.toThrow();
    expect(mod.fixtureById(1001n)).toMatchObject({ home: "Argentina" }); // demo slate intact
  });
});
