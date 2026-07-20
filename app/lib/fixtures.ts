// Stand-in for TxLINE's upcoming-Fixtures + StablePrice feed. Reference Odds are
// DISPLAY-ONLY (ADR-0003) — they never touch the program or affect payouts. Replace
// this module with the real TxLINE feed at integration; the shape is intentionally
// close (a fixtureId TxLINE would recognise, per-Outcome implied probabilities).

import { formatLine, marketLabel } from "./markets";

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

// ISO-3166 alpha-2 per national team. Regional-indicator maths turns the code into the
// flag emoji, so this map is the only thing to extend when the slate grows.
// ponytail: emoji flags, not image assets — swap for SVGs only if Windows rendering bites.
const TEAM_ISO: Record<string, string> = {
  Argentina: "AR", Australia: "AU", Belgium: "BE", Brazil: "BR", Canada: "CA",
  Colombia: "CO", Croatia: "HR", Denmark: "DK", Ecuador: "EC", Egypt: "EG",
  England: "GB", France: "FR", Germany: "DE", Ghana: "GH", Iran: "IR",
  Italy: "IT", Japan: "JP", Mexico: "MX", Morocco: "MA", Netherlands: "NL",
  Nigeria: "NG", Norway: "NO", Peru: "PE", Poland: "PL", Portugal: "PT",
  Qatar: "QA", Senegal: "SN", Serbia: "RS", "South Korea": "KR", Spain: "ES",
  Sweden: "SE", Switzerland: "CH", Tunisia: "TN", Uruguay: "UY", USA: "US",
  Wales: "GB", Nepal: "NP",
};

/** Flag emoji for a team name; a football when we don't know the country. */
export function teamFlag(team: string): string {
  const iso = TEAM_ISO[team.trim()];
  if (!iso) return "⚽";
  return String.fromCodePoint(...[...iso].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export function fixtureById(id: bigint): Fixture | undefined {
  return FIXTURES.find((f) => f.fixtureId === id);
}

/**
 * Fixtures we have seen, kept across reloads.
 *
 * TxLINE's /fixtures/snapshot only lists UPCOMING matches, so once a Fixture kicks off it
 * stops being resolvable — which is precisely when its Pool settles and the Proof Receipt
 * needs the team names. Without this, every settled Pool degrades to "Away win" and the hero
 * artifact loses the Fixture it is a proof about.
 *
 * ponytail: localStorage, not a DB column. Survives reload on the device that saw the Pool
 * open; a settled receipt opened cold on a new device still falls back. Persist the teams on
 * the Pool (or in pool_results) if share links need to resolve for strangers.
 */
const SEEN_KEY = "xodds.fixtures.seen";

export function restoreSeenFixtures(): void {
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (raw) hydrateFixtures(JSON.parse(raw) as Parameters<typeof hydrateFixtures>[0], false);
  } catch {
    /* corrupt or unavailable — the static slate still works */
  }
}

function saveSeen(): void {
  if (typeof localStorage === "undefined") return;
  try {
    // Only real Fixtures — the static demo slate is already in the bundle.
    const real = FIXTURES.filter((f) => f.referenceProbabilities.every((p) => p === 0));
    localStorage.setItem(
      SEEN_KEY,
      JSON.stringify(
        real.map((f) => ({
          fixtureId: f.fixtureId.toString(),
          home: f.home,
          away: f.away,
          kickoff: f.kickoff,
          competition: f.competition,
        })),
      ),
    );
  } catch {
    /* quota or private mode — cache is an optimisation, never a requirement */
  }
}

/**
 * Merge real TxLINE Fixtures (from /api/txline/fixtures) into the slate, so fixtureById keeps
 * working synchronously in every component. Real Fixtures carry no scripted odds/events — the
 * live TxLINE routes provide those. ponytail: module-level mutation, fine for a client slate;
 * move to context if fixtures ever need to be reactive outside useFixtures().
 */
export function hydrateFixtures(
  real: Array<{ fixtureId: string; home: string; away: string; kickoff: number; competition?: string }>,
  persist = true,
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
  if (persist) saveSeen();
}

/** Outcome labels for a Match Winner (1X2) Pool on a Fixture. */
export function outcomeLabels(f: Fixture): [string, string, string] {
  return [`${f.home} win`, "Draw", `${f.away} win`];
}

/** Outcome labels for any Pool Type: 1X2 for MatchWinner, Over/Under for the totals,
 * team-name-plus-line for Handicap. */
export type AnyPoolType = "matchWinner" | "totalGoals" | "totalCorners" | "totalCards" | "handicap";

export function poolOutcomeLabels(poolType: AnyPoolType, lineX2: number, f?: Fixture): string[] {
  // Handicap outcomes are named by TEAM, never "Home"/"Away": TxLINE's `Participant1IsHome`
  // is a feed designation, not a venue, and a World Cup fixture on neutral ground has no home
  // side a fan would recognise.
  if (poolType === "handicap") {
    const [home, away] = f ? [f.home, f.away] : ["Home", "Away"];
    return [`${home} ${formatLine(lineX2, true)}`, `${away} ${formatLine(-lineX2, true)}`];
  }
  if (poolType !== "matchWinner") {
    const line = lineX2 / 2;
    return [`Over ${line}`, `Under ${line}`];
  }
  return f ? [`${f.home} win`, "Draw", `${f.away} win`] : ["Home win", "Draw", "Away win"];
}

export function poolTypeLabel(poolType: AnyPoolType, lineX2: number): string {
  return poolType === "matchWinner" ? "Match Winner (1X2)" : marketLabel(poolType, lineX2);
}
