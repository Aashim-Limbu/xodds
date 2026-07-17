import { type AnyPoolType, type Fixture, poolOutcomeLabels } from "./fixtures";

// Pure summary of a settled Pool for the share card + OG image. Isomorphic (runs in the OG
// route server-side and the page client-side); unit-tested in tests/receipt.test.ts.

export interface ProvenLike {
  homeGoals: number;
  awayGoals: number;
}

export interface ReceiptSummary {
  matchup: string; // "Argentina vs Brazil" or "Fixture 1001"
  score: string; // "2–1"
  outcome: string; // the winning Outcome label, e.g. "Argentina win" / "Over 2.5"
  headline: string; // "ARGENTINA WIN" — the card's shout line
}

export function receiptSummary(
  fixtureId: bigint,
  poolType: AnyPoolType,
  lineX2: number,
  proven: ProvenLike,
  winningOutcome: number,
  fixture?: Fixture,
): ReceiptSummary {
  const matchup = fixture ? `${fixture.home} vs ${fixture.away}` : `Fixture ${fixtureId}`;
  const outcome = poolOutcomeLabels(poolType, lineX2, fixture)[winningOutcome] ?? "—";
  return {
    matchup,
    score: `${proven.homeGoals}–${proven.awayGoals}`,
    outcome,
    headline: outcome.toUpperCase(),
  };
}
