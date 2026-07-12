import { describe, expect, it } from "vitest";
import { decideAction, type FixtureResult } from "../keeper/decide.js";

const KICKOFF = 2_000_000_000;
const GRACE = 6 * 60 * 60;
const noResult: FixtureResult = null;
const finalised: FixtureResult = { kind: "finalised" };
const abandoned: FixtureResult = { kind: "abandoned" };

describe("Keeper decision core", () => {
  it("Locks an Open Pool only once kickoff has passed", () => {
    expect(decideAction("open", KICKOFF, KICKOFF - 1, noResult)).toBe("none");
    expect(decideAction("open", KICKOFF, KICKOFF, noResult)).toBe("lock");
    expect(decideAction("open", KICKOFF, KICKOFF + 100, noResult)).toBe("lock");
  });

  it("does not settle or void an Open Pool even if a result exists (must Lock first)", () => {
    expect(decideAction("open", KICKOFF, KICKOFF - 1, finalised)).toBe("none");
    expect(decideAction("open", KICKOFF, KICKOFF, finalised)).toBe("lock");
  });

  it("Settles a Locked Pool once TxLINE has a finalised result", () => {
    expect(decideAction("locked", KICKOFF, KICKOFF + 60, finalised)).toBe("settle");
  });

  it("routes an abandoned Fixture through settle (the program Voids it)", () => {
    expect(decideAction("locked", KICKOFF, KICKOFF + 60, abandoned)).toBe("settle");
  });

  it("waits while Locked with no result until the grace window elapses, then Voids", () => {
    expect(decideAction("locked", KICKOFF, KICKOFF + 60, noResult)).toBe("none");
    expect(decideAction("locked", KICKOFF, KICKOFF + GRACE - 1, noResult)).toBe("none");
    expect(decideAction("locked", KICKOFF, KICKOFF + GRACE, noResult)).toBe("void_expired");
  });

  it("prefers settling over the grace timeout when a result arrives late", () => {
    // Past the grace deadline, but TxLINE finalised AND settleable — settle beats Void.
    expect(decideAction("locked", KICKOFF, KICKOFF + GRACE + 1000, finalised, true)).toBe("settle");
  });

  it("waits while a result exists but its root is not yet published (before grace)", () => {
    // settleable=false: can't settle yet, but grace hasn't elapsed — don't Void prematurely.
    expect(decideAction("locked", KICKOFF, KICKOFF + 60, finalised, false)).toBe("none");
  });

  it("Voids past grace when a result exists but is unsettleable (root never published)", () => {
    // The funds-safety fallback: a result with no root must not strand funds forever.
    expect(decideAction("locked", KICKOFF, KICKOFF + GRACE, finalised, false)).toBe("void_expired");
    expect(decideAction("locked", KICKOFF, KICKOFF + GRACE, abandoned, false)).toBe("void_expired");
  });

  it("never touches a terminal Pool (idempotent across restarts)", () => {
    for (const r of [noResult, finalised, abandoned]) {
      expect(decideAction("settled", KICKOFF, KICKOFF + GRACE + 1, r)).toBe("none");
      expect(decideAction("void", KICKOFF, KICKOFF + GRACE + 1, r)).toBe("none");
    }
  });
});
