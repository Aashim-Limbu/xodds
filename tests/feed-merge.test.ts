import { describe, expect, it } from "vitest";
import { mergeEvents, type FeedEvent } from "../app/lib/feedEvents.js";

// The Feed's history/broadcast merge seam: persisted rows fetched on subscribe meet live
// broadcasts, in any order. Dedup by id, chronological, capped.

const ev = (id: string, ts: number): FeedEvent => ({ id, kind: "message", author: "a", text: id, ts });

describe("mergeEvents", () => {
  it("dedupes by id, keeping the first-seen event", () => {
    const out = mergeEvents([ev("x", 1)], [ev("x", 1), ev("y", 2)]);
    expect(out.map((e) => e.id)).toEqual(["x", "y"]);
  });

  it("sorts chronologically when history arrives after live events", () => {
    const out = mergeEvents([ev("live", 30)], [ev("old", 10), ev("mid", 20)]);
    expect(out.map((e) => e.id)).toEqual(["old", "mid", "live"]);
  });

  it("caps at the most recent 200 events", () => {
    const many = Array.from({ length: 250 }, (_, i) => ev(`e${i}`, i));
    const out = mergeEvents([], many);
    expect(out).toHaveLength(200);
    expect(out[0].id).toBe("e50"); // oldest 50 dropped
    expect(out[199].id).toBe("e249");
  });

  it("handles empty inputs", () => {
    expect(mergeEvents([], [])).toEqual([]);
    expect(mergeEvents([ev("a", 1)], []).map((e) => e.id)).toEqual(["a"]);
  });
});
