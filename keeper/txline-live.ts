import type { PublicKey } from "@solana/web3.js";
import { type FixtureResult } from "./decide.js";
import { type FixtureStats, scoresRootPda, STATUS_ABANDONED, STATUS_FINALISED } from "./merkle.js";
import { type TxLineClient } from "./txline.js";

// Real TxLINE World Cup free-tier data client (devnet). Reads the live scores feed and maps
// a finalised soccer record into our FixtureStats. This is the DATA plane only:
//
//   result() / stats() / siblings()  -> real TxLINE scores  (this file)
//   scoresRootAccount()              -> our ADR-0008 root    (still the txline_mock scheme)
//
// We deliberately keep settlement on our own Merkle scheme (ADR-0008): TxLINE's on-chain
// proof uses a different, hierarchical tree (["daily_scores_roots", epochDay] + validateStatV2
// on program 6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J), which our finalwhistle `settle`
// does not verify. Adopting it is an on-chain rewrite that supersedes ADR-0008 — tracked as a
// separate decision, not done here. Reading real results and re-anchoring them under our own
// root (publish-roots.ts) is coherent and end-to-end runnable today.
//
// AUTH: reads need an activated API token. Obtaining one is a ONE-TIME ops step per 4-week
// subscription (guestAuth -> on-chain `subscribe` tx -> activate), not per run. Do it once,
// put the two tokens in env, and the Keeper just reads. `guestAuth` and `activate` below are
// runnable; the on-chain `subscribe` tx needs TxLINE's devnet subscribe IDL + a funded TxL
// (Token-2022) wallet, which is out of this repo — see docs/quickstart. See also the doc page.

export const DEVNET_ORIGIN = "https://txline-dev.txodds.com";
export const MAINNET_ORIGIN = "https://txline.txodds.com";

/** One finalised-or-live record from GET /api/scores/snapshot/{fixtureId}. Partial shape — only
 * the fields we consume. `stats` is TxLINE's Map_ScoreStatKey (statKey string -> int value). */
export interface TxScores {
  fixtureId: number;
  action: string; // "game_finalised" on the settlement record; also "abandoned"-family
  participant1IsHome: boolean;
  statusSoccerId?: number;
  stats?: Record<string, number>;
}

// TxLINE soccer stat keys, full-match prefix (0). Base keys per the soccer feed:
// goals 1/2, yellow 3/4, red 5/6, corners 7/8 (participant1/participant2).
// ponytail: string keys are our read of the feed docs; pin them against one real finalised
// response and fix here if they differ — single locus, one-line change.
const K = {
  p1Goals: "1", p2Goals: "2",
  p1Yellow: "3", p2Yellow: "4",
  p1Red: "5", p2Red: "6",
  p1Corners: "7", p2Corners: "8",
} as const;

const FINALISED_ACTION = "game_finalised";
const ABANDONED_STATUS_IDS = new Set([15, 16]); // SoccerFixtureStatus: Abandoned, Cancelled

/** Live devnet responses are PascalCase (`Action`, `Stats`, …); accept either casing. */
function normalize(records: Array<Record<string, unknown>>): TxScores[] {
  return records.map((r) => ({
    fixtureId: (r.fixtureId ?? r.FixtureId ?? 0) as number,
    action: (r.action ?? r.Action ?? "") as string,
    participant1IsHome: (r.participant1IsHome ?? r.Participant1IsHome ?? true) as boolean,
    statusSoccerId: (r.statusSoccerId ?? r.StatusSoccerId) as number | undefined,
    stats: (r.stats ?? r.Stats) as Record<string, number> | undefined,
  }));
}

/** The finalised (or abandoned) record from a snapshot array, or null if the match is still live. */
function finalRecord(records: TxScores[]): TxScores | null {
  return records.find((r) => r.action === FINALISED_ACTION || ABANDONED_STATUS_IDS.has(r.statusSoccerId ?? -1)) ?? null;
}

/**
 * Map a TxLINE finalised soccer record to our leaf stats. Pure — this is the tested core.
 * Cards = yellow + red per team (CONTEXT: a Pool's "cards" is total cards). Returns null if
 * the snapshot has no finalised/abandoned record yet.
 */
export function parseFinalisedStats(fixtureId: bigint, records: TxScores[]): FixtureStats | null {
  const rec = finalRecord(normalize(records as unknown as Array<Record<string, unknown>>));
  if (!rec) return null;
  const s = rec.stats ?? {};
  const g = (k: string) => s[k] ?? 0;
  const p1 = {
    goals: g(K.p1Goals), corners: g(K.p1Corners), cards: g(K.p1Yellow) + g(K.p1Red),
  };
  const p2 = {
    goals: g(K.p2Goals), corners: g(K.p2Corners), cards: g(K.p2Yellow) + g(K.p2Red),
  };
  const [home, away] = rec.participant1IsHome ? [p1, p2] : [p2, p1];
  const abandoned = rec.action !== FINALISED_ACTION;
  return {
    fixtureId,
    homeGoals: home.goals, awayGoals: away.goals,
    homeCorners: home.corners, awayCorners: away.corners,
    homeCards: home.cards, awayCards: away.cards,
    status: abandoned ? STATUS_ABANDONED : STATUS_FINALISED,
  };
}

/** POST /auth/guest/start -> 30-day guest JWT. No wallet needed. */
export async function guestAuth(origin: string = DEVNET_ORIGIN): Promise<string> {
  const res = await fetch(`${origin}/auth/guest/start`, { method: "POST" });
  if (!res.ok) throw new Error(`guest auth failed: ${res.status}`);
  return ((await res.json()) as { token: string }).token;
}

/** POST /api/token/activate -> API token. Needs a confirmed on-chain `subscribe` txSig and a
 * base64 wallet signature over `${txSig}:${leagues.join(",")}:${jwt}` (see docs/quickstart). */
export async function activate(
  args: { origin?: string; jwt: string; txSig: string; walletSignature: string; leagues?: number[] },
): Promise<string> {
  const origin = args.origin ?? DEVNET_ORIGIN;
  const res = await fetch(`${origin}/api/token/activate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${args.jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({ txSig: args.txSig, walletSignature: args.walletSignature, leagues: args.leagues ?? [] }),
  });
  if (!res.ok) throw new Error(`activate failed: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { token: string }).token;
}

/** Read TxLINE's live scores using credentials obtained once via the subscribe/activate flow.
 * Settlement stays on our own root (ADR-0008): scoresRootAccount() delegates to the mock scheme,
 * and the Keeper self-publishes the root over these real stats before settling. */
export class RealTxLine implements TxLineClient {
  private cache = new Map<bigint, FixtureStats | null>();

  constructor(
    private readonly creds: { jwt: string; apiToken: string; origin?: string },
    private readonly slateStats: Map<bigint, FixtureStats> = new Map(),
  ) {}

  private async snapshot(fixtureId: bigint): Promise<FixtureStats | null> {
    if (this.cache.has(fixtureId)) return this.cache.get(fixtureId)!;
    const origin = this.creds.origin ?? DEVNET_ORIGIN;
    const res = await fetch(`${origin}/api/scores/snapshot/${fixtureId}`, {
      headers: { Authorization: `Bearer ${this.creds.jwt}`, "X-Api-Token": this.creds.apiToken },
    });
    if (!res.ok) throw new Error(`scores snapshot ${fixtureId} failed: ${res.status}`);
    const stats = parseFinalisedStats(fixtureId, (await res.json()) as TxScores[]);
    if (stats) {
      this.cache.set(fixtureId, stats);
      this.slateStats.set(fixtureId, stats);
    }
    return stats;
  }

  // TxLineClient is sync; the Keeper loop awaits refresh() before a tick so snapshots are cached.
  async refresh(fixtureIds: bigint[]): Promise<void> {
    await Promise.all(fixtureIds.map((id) => this.snapshot(id).catch(() => null)));
  }

  result(fixtureId: bigint): FixtureResult {
    const s = this.slateStats.get(fixtureId);
    if (!s) return null;
    return { kind: s.status === STATUS_ABANDONED ? "abandoned" : "finalised" };
  }

  stats(fixtureId: bigint): FixtureStats | null {
    return this.slateStats.get(fixtureId) ?? null;
  }

  scoresRootAccount(fixtureId: bigint): PublicKey | null {
    // Settlement plane: our own root under txline_mock (published by publish-roots over these
    // real stats). Swap for TxLINE's daily_scores_roots PDA only after the on-chain rewrite.
    return this.slateStats.has(fixtureId) ? scoresRootPda(fixtureId) : null;
  }

  siblings(fixtureId: bigint): FixtureStats[] {
    // Single-leaf tree per Fixture (root = leaf hash). Deliberate: siblings here would be
    // "whichever slate Fixtures happen to have finalised by now", which drifts between the
    // tick that publishes the root and a later tick settling another Pool on the same
    // Fixture — a proof/root mismatch. The root lives in a per-Fixture PDA, so decoy
    // siblings add nothing; empty keeps publish and settle consistent forever.
    return [];
  }
}
