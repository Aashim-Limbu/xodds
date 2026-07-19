import type { PublicKey } from "@solana/web3.js";
import type { PoolAccount, PoolTypeName } from "./anchorClient";

/** One market a Fixture can carry. `defaultLineX2` is the Line x2 — always ODD, because
 * create_pool rejects an even line so that a push is arithmetically impossible (lib.rs:50-56). */
export interface MarketSpec {
  poolType: PoolTypeName;
  label: string;
  hasLine: boolean;
  defaultLineX2: number;
  /** Whether TxLINE publishes odds for this market. Verified against the live API: only 1X2
   * and Over/Under goals do. Corners and Cards settle from proven stats with no odds. */
  hasOdds: boolean;
}

export const MARKETS: MarketSpec[] = [
  { poolType: "matchWinner", label: "Match Winner", hasLine: false, defaultLineX2: 0, hasOdds: true },
  { poolType: "totalGoals", label: "Total Goals", hasLine: true, defaultLineX2: 5, hasOdds: true },
  { poolType: "totalCorners", label: "Total Corners", hasLine: true, defaultLineX2: 19, hasOdds: false },
  { poolType: "totalCards", label: "Total Cards", hasLine: true, defaultLineX2: 9, hasOdds: false },
];

export function marketLabel(poolType: PoolTypeName, lineX2: number): string {
  const spec = MARKETS.find((m) => m.poolType === poolType);
  if (!spec) return poolType;
  return spec.hasLine ? `${spec.label} O/U ${lineX2 / 2}` : spec.label;
}

export type MatchState = "open" | "locked" | "settled" | "void";

/** A Match is derived, never stored: (group, fixtureId) plus whatever Pools exist under it. */
export interface Match {
  fixtureId: bigint;
  group: PublicKey;
  pools: PoolAccount[];
  /** Combined pot across every market — each Pool keeps its own escrow; this is display only. */
  pot: bigint;
  state: MatchState;
}

/** A Match is as "live" as its liveliest Pool: open if anything is still backable, then
 * locked, and only settled once every Pool has reached a terminal state. */
function matchState(pools: PoolAccount[]): MatchState {
  if (pools.some((p) => p.state === "open")) return "open";
  if (pools.some((p) => p.state === "locked")) return "locked";
  if (pools.every((p) => p.state === "void")) return "void";
  return "settled";
}

export function groupByFixture(pools: PoolAccount[]): Match[] {
  const byFixture = new Map<string, PoolAccount[]>();
  for (const p of pools) {
    const key = p.fixtureId.toString();
    byFixture.set(key, [...(byFixture.get(key) ?? []), p]);
  }
  return [...byFixture.values()].map((group) => ({
    fixtureId: group[0].fixtureId,
    group: group[0].group,
    pools: group,
    pot: group.reduce((sum, p) => sum + p.pot, 0n),
    state: matchState(group),
  }));
}
