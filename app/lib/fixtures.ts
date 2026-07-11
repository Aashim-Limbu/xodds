// Stand-in for TxLINE's upcoming-Fixtures + StablePrice feed. Reference Odds are
// DISPLAY-ONLY (ADR-0003) — they never touch the program or affect payouts. Replace
// this module with the real TxLINE feed at integration; the shape is intentionally
// close (a fixtureId TxLINE would recognise, per-Outcome implied probabilities).

export interface Fixture {
  fixtureId: bigint;
  home: string;
  away: string;
  kickoff: number; // unix seconds
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

/** Outcome labels for a Match Winner (1X2) Pool on a Fixture. */
export function outcomeLabels(f: Fixture): [string, string, string] {
  return [`${f.home} win`, "Draw", `${f.away} win`];
}
