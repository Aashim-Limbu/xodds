// App-side mapping of TxLINE feed payloads to the shapes the UI already uses (Reference
// Odds as implied probabilities; Feed lines from a finalised score). Pure + isomorphic —
// the /api/txline route runs it server-side (tokens stay on the server), and it's unit-
// tested in tests/txline-app.test.ts. Mirrors the keeper's data-plane read (keeper/txline-live.ts);
// the app duplicates rather than cross-imports, the same convention as lib/proof.ts.

/** GET /api/odds/snapshot/{fixtureId} — one bookmaker line. Partial shape; fields we consume. */
export interface OddsPayload {
  SuperOddsType: string;
  MarketPeriod?: string;
  /** e.g. "line=2.25" (string) or { line: 2.25 } — the feed has shown both shapes. */
  MarketParameters?: string | { line?: number };
  InRunning: boolean;
  PriceNames: string[];
  Pct: string[]; // implied probability %, 3 decimals or "NA"
  Ts: number;
}

/** GET /api/scores/snapshot/{fixtureId} — one record. Partial shape. */
export interface ScoresRecord {
  action: string;
  participant1IsHome: boolean;
  statusSoccerId?: number;
  seq?: number;
  stats?: Record<string, number>;
}

/** The live feed returns PascalCase fields (`Action`, `Stats`, …); our types and tests use
 * camelCase. Normalise at the boundary, accepting either casing. */
export function normalizeScores(records: Array<Record<string, unknown>>): ScoresRecord[] {
  return records.map((r) => ({
    action: (r.action ?? r.Action ?? "") as string,
    participant1IsHome: (r.participant1IsHome ?? r.Participant1IsHome ?? true) as boolean,
    statusSoccerId: (r.statusSoccerId ?? r.StatusSoccerId) as number | undefined,
    seq: (r.seq ?? r.Seq) as number | undefined,
    stats: (r.stats ?? r.Stats) as Record<string, number> | undefined,
  }));
}

/** GET /api/fixtures/snapshot — one upcoming Fixture. Partial shape. */
export interface TxFixture {
  FixtureId: number;
  Participant1: string;
  Participant2: string;
  Participant1IsHome: boolean;
  StartTime: number; // unix ms
  Competition?: string; // e.g. "World Cup", "Friendlies"
}

/** The match as it stands right now — the Locked-state scoreline strip. */
export interface LiveScore {
  home: number;
  away: number;
  phase: string; // "First half", "Half-time", …
}

/** What the route returns to the client; all optional so the UI falls back to static fixtures. */
export interface TxlineLive {
  referenceProbabilities?: [number, number, number];
  matchEvents?: string[];
  score?: LiveScore;
  /** Suggested Total Goals lines from the odds feed, as line×2 (odd = half-integer only). */
  goalLines?: number[];
}

// Live devnet feed pins SuperOddsType = "1X2_PARTICIPANT_RESULT" (probe 2026-07-16); older
// docs said "1X2" — match both.
const is1x2 = (t: string) => /1X2/i.test(t);
const isGoalsOU = (t: string) => /OVERUNDER.*GOALS/i.test(t);
// In-running lines are deliberately INCLUDED: pre-kickoff the feed carries pre-match lines,
// in-play it carries InRunning ones — latest-Ts-wins means Reference Odds become live win
// probabilities once the match starts (the Locked-state ticker).
const isFullTime = (p: OddsPayload) => !p.MarketPeriod || /full|match|ft/i.test(p.MarketPeriod);
const HOME_NAMES = new Set(["1", "home", "h"]);
const DRAW_NAMES = new Set(["x", "draw", "tie"]);
const AWAY_NAMES = new Set(["2", "away", "a"]);

function pctToProb(pct: string | undefined): number {
  if (!pct || pct === "NA") return 0;
  const n = Number(pct);
  return Number.isFinite(n) ? n / 100 : 0;
}

/**
 * Pick the latest full-time 1X2 line and return normalised [home, draw, away] implied
 * probabilities. Returns undefined if no usable 1X2 line is present (UI keeps its fallback).
 */
export function pick1x2Probabilities(odds: OddsPayload[]): [number, number, number] | undefined {
  const lines = odds
    .filter((p) => is1x2(p.SuperOddsType) && isFullTime(p) && p.PriceNames.length === 3)
    .sort((a, b) => b.Ts - a.Ts);
  const line = lines[0];
  if (!line) return undefined;

  const slot = [0, 0, 0] as [number, number, number];
  line.PriceNames.forEach((name, i) => {
    const key = name.trim().toLowerCase();
    const prob = pctToProb(line.Pct[i]);
    if (HOME_NAMES.has(key)) slot[0] = prob;
    else if (DRAW_NAMES.has(key)) slot[1] = prob;
    else if (AWAY_NAMES.has(key)) slot[2] = prob;
  });
  const sum = slot[0] + slot[1] + slot[2];
  if (sum <= 0) return undefined;
  return [slot[0] / sum, slot[1] / sum, slot[2] / sum]; // strip the bookmaker's overround
}

/** The market's O/U line from MarketParameters (either shape), or undefined. */
function marketLine(p: OddsPayload): number | undefined {
  const mp = p.MarketParameters;
  if (typeof mp === "string") {
    const m = /line=([\d.]+)/.exec(mp);
    return m ? Number(m[1]) : undefined;
  }
  return mp?.line;
}

/**
 * Suggested Total Goals lines from the odds feed, as line×2, half-integers only (the program
 * forbids pushes, so quarter lines like 2.25 are dropped — decision 2026-07-16). Sorted asc.
 */
export function pickGoalLines(odds: OddsPayload[]): number[] {
  const lines = new Set<number>();
  for (const p of odds) {
    if (!isGoalsOU(p.SuperOddsType) || !isFullTime(p)) continue;
    const line = marketLine(p);
    if (line === undefined) continue;
    const x2 = line * 2;
    // Exact half-integer lines only: 2.5 -> 5 ✓; quarter lines (2.25 -> 4.5) are DROPPED,
    // not rounded — the feed never quoted 2.5 (Codex P2).
    if (Number.isInteger(x2) && x2 % 2 === 1) lines.add(x2);
  }
  return [...lines].sort((a, b) => a - b);
}

const K = { p1g: "1", p2g: "2", p1y: "3", p2y: "4", p1r: "5", p2r: "6", p1c: "7", p2c: "8" };

// SoccerFixtureStatus (soccer feed docs) → the phase label shown on the live strip.
const PHASE: Record<number, string> = {
  1: "Kick-off soon", 2: "First half", 3: "Half-time", 4: "Second half", 5: "Full time",
  6: "Extra time soon", 7: "Extra time", 8: "ET half-time", 9: "Extra time", 10: "Full time (AET)",
  11: "Penalties soon", 12: "Penalties", 13: "Full time (pens)",
  14: "Interrupted", 15: "Abandoned", 16: "Cancelled", 19: "Postponed",
};

/** The current scoreline + phase from the latest snapshot record; undefined before any record. */
export function liveScore(records: ScoresRecord[]): LiveScore | undefined {
  const rec = [...records].sort((a, b) => (b.seq ?? 0) - (a.seq ?? 0))[0];
  if (!rec) return undefined;
  const s = rec.stats ?? {};
  const p1 = s[K.p1g] ?? 0;
  const p2 = s[K.p2g] ?? 0;
  const [home, away] = rec.participant1IsHome ? [p1, p2] : [p2, p1];
  return { home, away, phase: PHASE[rec.statusSoccerId ?? 0] ?? "In play" };
}

/**
 * Feed summary lines from a finalised score snapshot — real data, not a scripted play-by-play
 * (the live minute-by-minute stream is the SSE upgrade). Empty array while the match is unfinished.
 */
export function finalisedFeedLines(records: ScoresRecord[]): string[] {
  const rec = records.find((r) => r.action === "game_finalised");
  if (!rec) return [];
  const s = rec.stats ?? {};
  const g = (k: string) => s[k] ?? 0;
  const home = { g: g(K.p1g), c: g(K.p1c), cards: g(K.p1y) + g(K.p1r) };
  const away = { g: g(K.p2g), c: g(K.p2c), cards: g(K.p2y) + g(K.p2r) };
  const [h, a] = rec.participant1IsHome ? [home, away] : [away, home];
  return [
    `🚩 Full time — ${h.g}–${a.g}`,
    `🟨 Cards ${h.cards}–${a.cards}  ·  🚩 Corners ${h.c}–${a.c}`,
  ];
}
