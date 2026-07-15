import { describe, expect, it } from "vitest";
import { finalisedFeedLines, liveScore, pick1x2Probabilities, type OddsPayload, type ScoresRecord } from "../app/lib/txline.js";

describe("pick1x2Probabilities", () => {
  const line = (over: Partial<OddsPayload>): OddsPayload => ({
    SuperOddsType: "1X2", MarketPeriod: "FullTime", InRunning: false,
    PriceNames: ["1", "X", "2"], Pct: ["50.000", "25.000", "25.000"], Ts: 1000, ...over,
  });

  it("maps a full-time 1X2 line to normalised [home, draw, away]", () => {
    const p = pick1x2Probabilities([line({})])!;
    expect(p[0]).toBeCloseTo(0.5);
    expect(p[1]).toBeCloseTo(0.25);
    expect(p[2]).toBeCloseTo(0.25);
    expect(p[0] + p[1] + p[2]).toBeCloseTo(1); // overround stripped
  });

  it("strips the overround so probabilities sum to 1", () => {
    const p = pick1x2Probabilities([line({ Pct: ["55.000", "30.000", "30.000"] })])!;
    expect(p[0] + p[1] + p[2]).toBeCloseTo(1);
  });

  it("prefers the latest line (in-running included — the live ticker) and ignores non-1X2", () => {
    const p = pick1x2Probabilities([
      line({ Ts: 1, Pct: ["90.000", "5.000", "5.000"] }),
      line({ Ts: 9, Pct: ["40.000", "20.000", "40.000"] }),
      line({ Ts: 20, InRunning: true, Pct: ["70.000", "20.000", "10.000"] }),
      line({ Ts: 99, SuperOddsType: "OverUnder" }),
    ])!;
    expect(p[0]).toBeCloseTo(0.7); // the in-play line, being latest, wins
    expect(p[2]).toBeCloseTo(0.1);
  });

  it("returns undefined when no usable 1X2 line exists", () => {
    expect(pick1x2Probabilities([line({ SuperOddsType: "OverUnder" })])).toBeUndefined();
  });
});

describe("finalisedFeedLines", () => {
  const finalised: ScoresRecord[] = [
    { action: "game_finalised", participant1IsHome: true, stats: { "1": 2, "2": 1, "3": 1, "5": 1, "7": 6, "8": 4 } },
  ];
  it("summarises a finalised score from the home team's view", () => {
    expect(finalisedFeedLines(finalised)[0]).toBe("🚩 Full time — 2–1");
    expect(finalisedFeedLines(finalised)[1]).toContain("Cards 2–0");
  });
  it("is empty while the match is unfinished", () => {
    expect(finalisedFeedLines([{ action: "in_play", participant1IsHome: true }])).toEqual([]);
  });
});

describe("liveScore", () => {
  it("reads the latest record's score and phase", () => {
    const records = [
      { action: "in_play", participant1IsHome: true, statusSoccerId: 2, seq: 5, stats: { "1": 1, "2": 0 } },
      { action: "in_play", participant1IsHome: true, statusSoccerId: 4, seq: 9, stats: { "1": 2, "2": 1 } },
    ];
    expect(liveScore(records)).toEqual({ home: 2, away: 1, phase: "Second half" });
  });
  it("swaps sides when participant1 is away", () => {
    const r = liveScore([{ action: "in_play", participant1IsHome: false, statusSoccerId: 3, seq: 1, stats: { "1": 3, "2": 0 } }])!;
    expect([r.home, r.away, r.phase]).toEqual([0, 3, "Half-time"]);
  });
  it("is undefined with no records", () => {
    expect(liveScore([])).toBeUndefined();
  });
});
