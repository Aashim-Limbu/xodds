// Stand-in for TxLINE's upcoming-Fixtures + StablePrice feed. Reference Odds are
// DISPLAY-ONLY (ADR-0003) — they never touch the program or affect payouts. Replace
// this module with the real TxLINE feed at integration; the shape is intentionally
// close (a fixtureId TxLINE would recognise, per-Outcome implied probabilities).

export interface Fixture {
  fixtureId: bigint;
  home: string;
  away: string;
  kickoff: number; // unix seconds
  /** Competition name from TxLINE ("World Cup", "Friendlies"); "Demo" for the static slate. */
  competition?: string;
  /** Reference Odds as implied probabilities per Outcome [home win, draw, away win]. */
  referenceProbabilities: [number, number, number];
  /** Scripted in-match events for the Feed — a stand-in for TxLINE's live scores stream
   * (there is no live feed here). These replay once when the Pool Locks. */
  matchEvents?: string[];
}

// A fixed slate for the demo. Kickoffs are far-future so Pools stay Open in the demo.
export const FIXTURES: Fixture[] = [
  {
    fixtureId: 1001n,
    home: "Argentina",
    away: "Brazil",
    kickoff: 2_000_000_000,
    referenceProbabilities: [0.42, 0.27, 0.31],
    matchEvents: [
      "⚽ 23' GOAL — Argentina (1–0)",
      "🟨 41' Yellow card — Brazil",
      "⚽ 67' GOAL — Brazil (1–1)",
      "🚩 90'+3 Full time",
    ],
  },
  {
    fixtureId: 1002n,
    home: "France",
    away: "England",
    kickoff: 2_000_100_000,
    referenceProbabilities: [0.4, 0.29, 0.31],
  },
  {
    fixtureId: 1003n,
    home: "Spain",
    away: "Germany",
    kickoff: 2_000_200_000,
    referenceProbabilities: [0.38, 0.3, 0.32],
  },
];

export function fixtureById(id: bigint): Fixture | undefined {
  return FIXTURES.find((f) => f.fixtureId === id);
}

/**
 * Merge real TxLINE Fixtures (from /api/txline/fixtures) into the slate, so fixtureById keeps
 * working synchronously in every component. Real Fixtures carry no scripted odds/events — the
 * live TxLINE routes provide those. ponytail: module-level mutation, fine for a client slate;
 * move to context if fixtures ever need to be reactive outside useFixtures().
 */
export function hydrateFixtures(
  real: Array<{ fixtureId: string; home: string; away: string; kickoff: number; competition?: string }>,
): void {
  for (const r of real) {
    const id = BigInt(r.fixtureId);
    if (!FIXTURES.some((f) => f.fixtureId === id)) {
      FIXTURES.push({
        fixtureId: id, home: r.home, away: r.away, kickoff: r.kickoff,
        competition: r.competition || "Friendlies",
        referenceProbabilities: [0, 0, 0],
      });
    }
  }
}

/** Outcome labels for a Match Winner (1X2) Pool on a Fixture. */
export function outcomeLabels(f: Fixture): [string, string, string] {
  return [`${f.home} win`, "Draw", `${f.away} win`];
}

/** Outcome labels for any Pool Type: 1X2 for MatchWinner, Over/Under for Total Goals. */
export type AnyPoolType = "matchWinner" | "totalGoals" | "totalCorners" | "totalCards";

export function poolOutcomeLabels(poolType: AnyPoolType, lineX2: number, f?: Fixture): string[] {
  if (poolType !== "matchWinner") {
    const line = lineX2 / 2;
    return [`Over ${line}`, `Under ${line}`];
  }
  return f ? [`${f.home} win`, "Draw", `${f.away} win`] : ["Home win", "Draw", "Away win"];
}

/** Human label for a Pool Type. */
const OU_LABEL: Record<Exclude<AnyPoolType, "matchWinner">, string> = {
  totalGoals: "Total Goals",
  totalCorners: "Total Corners",
  totalCards: "Total Cards",
};

export function poolTypeLabel(poolType: AnyPoolType, lineX2: number): string {
  return poolType === "matchWinner" ? "Match Winner (1X2)" : `${OU_LABEL[poolType]} O/U ${lineX2 / 2}`;
}
