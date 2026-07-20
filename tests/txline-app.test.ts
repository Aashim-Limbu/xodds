import { describe, expect, it } from "vitest";
import { finalisedFeedLines, hasFinalised, liveScore, marketState, normalizeScores, pick1x2Probabilities, pickGoalLines, pickHandicapLines, type OddsPayload, type ScoresRecord } from "../app/lib/txline.js";
import { poolKickoffTs } from "../app/lib/config.js";

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

  // Regression: devnet fixture 18257739 quoted 1X2 only as `half=1`, which the full-time
  // filter rejected — every real Pool rendered "—" instead of odds.
  it("falls back to a period line when the feed quotes no full-time 1X2", () => {
    const p = pick1x2Probabilities([
      line({ MarketPeriod: "half=1", PriceNames: ["part1", "draw", "part2"], Pct: ["30.618", "48.309", "21.070"] }),
    ])!;
    expect(p[1]).toBeCloseTo(0.4831, 3);
    expect(p[0] + p[1] + p[2]).toBeCloseTo(1);
  });

  it("still prefers a full-time line over a period line", () => {
    const p = pick1x2Probabilities([
      line({ Ts: 99, MarketPeriod: "half=1", Pct: ["90.000", "5.000", "5.000"] }),
      line({ Ts: 1, MarketPeriod: "FullTime", Pct: ["40.000", "20.000", "40.000"] }),
    ])!;
    expect(p[0]).toBeCloseTo(0.4); // older, but full-time wins
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

describe("marketState", () => {
  const KICK = 2_000_000_000; // unix seconds
  const before = (KICK - 1) * 1000;
  const after = (KICK + 1) * 1000;

  it("is OPEN before kickoff", () => {
    expect(marketState(KICK, before, false)).toBe("open");
  });
  it("is LIVE after kickoff when not finalised (clock fallback)", () => {
    expect(marketState(KICK, after, false)).toBe("live");
  });
  it("ENDED comes only from the finalised feed, never the clock", () => {
    expect(marketState(KICK, after, true)).toBe("ended");
    // Well past kickoff but no finalised signal -> still LIVE, not guessed ENDED.
    expect(marketState(KICK, after + 6 * 3_600_000, false)).toBe("live");
  });
  it("hasFinalised gates on the game_finalised record", () => {
    expect(hasFinalised([{ action: "in_play", participant1IsHome: true }])).toBe(false);
    expect(hasFinalised([{ action: "game_finalised", participant1IsHome: true }])).toBe(true);
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

  // Regression, from the live feed (fixture 18257739, probed 47 minutes BEFORE kickoff): the
  // real payload publishes records as soon as a fixture is listed — GameState "scheduled",
  // Stats {}, and no StatusSoccerId at all. The phase lookup then missed and fell through to
  // the literal "In play", so the banner announced "IN PLAY Spain 0–0 Argentina" for a match
  // that had not started. A fabricated live score on a betting surface.
  it("does NOT invent a live score for a scheduled match", () => {
    expect(
      liveScore([{ action: "comment", participant1IsHome: true, gameState: "scheduled", seq: 1, stats: {} }]),
    ).toBeUndefined();
  });

  it("still reports a score once the feed leaves 'scheduled'", () => {
    const r = liveScore([
      { action: "in_play", participant1IsHome: true, gameState: "inplay", statusSoccerId: 2, seq: 3, stats: { "1": 1, "2": 0 } },
    ])!;
    expect([r.home, r.away, r.phase]).toEqual([1, 0, "First half"]);
  });

  it("carries GameState through the PascalCase boundary", () => {
    expect(normalizeScores([{ GameState: "scheduled", Action: "comment", Participant1IsHome: true }])[0].gameState).toBe("scheduled");
  });
});

describe("normalizeScores", () => {
  it("accepts the live feed's PascalCase fields", () => {
    const [r] = normalizeScores([
      { Action: "game_finalised", Participant1IsHome: false, StatusSoccerId: 5, Seq: 9, Stats: { "1": 2 } },
    ]);
    expect(r).toEqual({ action: "game_finalised", participant1IsHome: false, statusSoccerId: 5, seq: 9, stats: { "1": 2 } });
  });

  it("passes camelCase through unchanged", () => {
    const [r] = normalizeScores([{ action: "comment", participant1IsHome: true, stats: {} }]);
    expect(r.action).toBe("comment");
    expect(r.participant1IsHome).toBe(true);
  });
});

describe("pickGoalLines", () => {
  const ou = (line: number | string, period?: string) => ({
    SuperOddsType: "OVERUNDER_PARTICIPANT_GOALS",
    MarketPeriod: period,
    MarketParameters: typeof line === "string" ? line : { line },
    InRunning: false,
    PriceNames: ["over", "under"],
    Pct: ["50", "50"],
    Ts: 1,
  });

  it("keeps half-lines, drops quarter-lines, dedupes and sorts", () => {
    const lines = pickGoalLines([ou(2.5), ou("line=3.5"), ou(2.25), ou(2.5)]);
    expect(lines).toEqual([5, 7]); // line×2
  });

  it("ignores first-half markets and other odds types", () => {
    expect(pickGoalLines([ou(1.5, "half=1"), { ...ou(2.5), SuperOddsType: "1X2_PARTICIPANT_RESULT" }])).toEqual([]);
  });
  it("drops a lone quarter-line entirely (never rounds 2.25 to 2.5)", () => {
    expect(pickGoalLines([ou(2.25)])).toEqual([]);
  });
});

describe("pickHandicapLines", () => {
  // Shaped from the live devnet feed (probe 2026-07-19, fixture 18257739): the real payload
  // quotes ASIANHANDICAP_PARTICIPANT_GOALS with MarketParameters as the STRING "line=-0.5",
  // and the observed full-time ladder was 0.25, 0, -0.25, -0.5, -0.75, -1, -1.25.
  const ah = (line: number | string, period?: string) => ({
    SuperOddsType: "ASIANHANDICAP_PARTICIPANT_GOALS",
    MarketPeriod: period,
    MarketParameters: typeof line === "string" ? line : { line },
    InRunning: false,
    PriceNames: ["part1", "part2"],
    Pct: ["NA", "NA"],
    Ts: 1,
  });

  it("parses a NEGATIVE line from the string form", () => {
    // The sign is the whole meaning of a handicap — dropping it would swap which team is
    // giving goals away, and settle the Pool for the opposite side.
    expect(pickHandicapLines([ah("line=-0.5")])).toEqual([-1]);
  });

  it("keeps only half-lines out of the real observed ladder", () => {
    // Quarter lines half-push and whole lines push; the program has no per-Entry refund, so
    // both are dropped rather than rounded. Of the seven lines the feed actually quoted, one
    // survives.
    const feed = [0.25, 0, -0.25, -0.5, -0.75, -1, -1.25].map((l) => ah(`line=${l}`));
    expect(pickHandicapLines(feed)).toEqual([-1]);
  });

  it("flips the sign when part1 is the AWAY side, so the Line stays home-relative", () => {
    expect(pickHandicapLines([ah("line=-0.5")], false)).toEqual([1]);
  });

  it("ignores first-half markets and other odds types", () => {
    expect(pickHandicapLines([ah(-0.5, "half=1"), { ...ah(-0.5), SuperOddsType: "OVERUNDER_PARTICIPANT_GOALS" }])).toEqual([]);
  });
});

describe("poolKickoffTs", () => {
  const now = () => Math.floor(Date.now() / 1000);

  it("uses the Fixture's real kickoff when it is still ahead", () => {
    const real = now() + 12 * 3600;
    expect(poolKickoffTs(real)).toBe(real);
  });

  it("falls back to the demo offset when the Fixture has no kickoff", () => {
    expect(poolKickoffTs(undefined)).toBeGreaterThan(now());
  });

  it("falls back rather than birthing an instantly-lockable Pool on a past kickoff", () => {
    expect(poolKickoffTs(now() - 3600)).toBeGreaterThan(now());
  });
});
