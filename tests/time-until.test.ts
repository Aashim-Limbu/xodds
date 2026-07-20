import { describe, expect, it } from "vitest";
import { timeUntil } from "../app/lib/format.js";

// The Match header switches from a countdown to the live scoreline off this function's null,
// so the boundary at kickoff is the part that actually matters.
const NOW = 1_800_000_000_000; // fixed ms — no wall clock in tests
const at = (secsFromNow: number) => Math.floor(NOW / 1000) + secsFromNow;

describe("timeUntil", () => {
  it("returns null once the instant has passed, and exactly at it", () => {
    expect(timeUntil(at(-1), NOW)).toBeNull();
    expect(timeUntil(at(0), NOW)).toBeNull();
  });

  it("counts days with hours, dropping a zero hour", () => {
    expect(timeUntil(at(2 * 86400 + 4 * 3600), NOW)).toBe("2d 4h");
    expect(timeUntil(at(2 * 86400), NOW)).toBe("2d");
  });

  it("counts hours with minutes below a day", () => {
    expect(timeUntil(at(3 * 3600 + 12 * 60), NOW)).toBe("3h 12m");
    expect(timeUntil(at(3 * 3600), NOW)).toBe("3h");
  });

  it("counts minutes below an hour", () => {
    expect(timeUntil(at(45 * 60), NOW)).toBe("45m");
  });

  it("says 'any moment now' inside the last minute rather than counting seconds", () => {
    expect(timeUntil(at(30), NOW)).toBe("any moment now");
  });
});
