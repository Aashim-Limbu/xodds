import type { PublicKey } from "@solana/web3.js";
import { type FixtureResult } from "./decide.js";
import { type FixtureStats, scoresRootPda, STATUS_ABANDONED } from "./merkle.js";

/**
 * What the Keeper needs from TxLINE. A real implementation watches TxLINE's scores stream
 * and reads its on-chain `daily_scores_roots`; the stand-in below scripts results for the
 * demo (there is no live TxLINE here).
 */
export interface TxLineClient {
  /** Has the Fixture finalised (or been abandoned)? `null` if still in play / not started. */
  result(fixtureId: bigint): FixtureResult;
  /** The proven team-level stats for a finalised/abandoned Fixture (leaf contents). */
  stats(fixtureId: bigint): FixtureStats | null;
  /**
   * TxLINE's on-chain `daily_scores_roots` account holding the score root the Fixture's
   * proof verifies against. `null` when no such account exists — e.g. this stand-in,
   * which cannot create a TxLINE-owned account (only TxLINE can). The Keeper needs a real
   * root here to submit `settle`; `lock` and `void_expired` need nothing from TxLINE.
   */
  scoresRootAccount(fixtureId: bigint): PublicKey | null;
  /** Other Fixtures sharing the Fixture's daily root — the proof's Merkle decoys. */
  siblings(fixtureId: bigint): FixtureStats[];
}

/**
 * Demo stand-in: scripted results for a fixed slate. It yields finalised stats so the
 * Keeper's settle path is exercised in unit tests, but returns no on-chain root — a real
 * TxLINE (or a mock scores publisher) provides that at integration. Lock and Void still
 * run fully against devnet without it.
 */
export class StandInTxLine implements TxLineClient {
  private readonly results: Map<bigint, FixtureStats>;

  constructor(finalised: FixtureStats[] = DEMO_RESULTS) {
    this.results = new Map(finalised.map((s) => [s.fixtureId, s]));
  }

  result(fixtureId: bigint): FixtureResult {
    const s = this.results.get(fixtureId);
    if (!s) return null;
    return { kind: s.status === STATUS_ABANDONED ? "abandoned" : "finalised" };
  }

  stats(fixtureId: bigint): FixtureStats | null {
    return this.results.get(fixtureId) ?? null;
  }

  scoresRootAccount(fixtureId: bigint): PublicKey | null {
    // The txline_mock program owns a PDA per Fixture holding the root, published by the
    // publish-roots demo step. It exists only for Fixtures with a result.
    return this.results.has(fixtureId) ? scoresRootPda(fixtureId) : null;
  }

  siblings(fixtureId: bigint): FixtureStats[] {
    return [...this.results.values()].filter((s) => s.fixtureId !== fixtureId);
  }

  /** Fixtures with a scripted result — the ones the demo publishes score roots for. */
  finalisedFixtureIds(): bigint[] {
    return [...this.results.keys()];
  }
}

// Scripted final results for the demo slate (matches app/lib/fixtures.ts fixtureIds).
const DEMO_RESULTS: FixtureStats[] = [
  { fixtureId: 1001n, homeGoals: 1, awayGoals: 1, homeCorners: 6, awayCorners: 4, homeCards: 2, awayCards: 1 },
  { fixtureId: 1002n, homeGoals: 2, awayGoals: 0, homeCorners: 5, awayCorners: 3, homeCards: 1, awayCards: 3 },
  { fixtureId: 1003n, homeGoals: 0, awayGoals: 0, homeCorners: 2, awayCorners: 2, homeCards: 0, awayCards: 0, status: STATUS_ABANDONED },
];
