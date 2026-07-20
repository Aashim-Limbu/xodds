import type { PublicKey } from "@solana/web3.js";
import type { PoolAccount, PoolTypeName } from "./anchorClient";
import type { TxlineLive } from "./txline";

/** One market a Fixture can carry. `fallbackLinesX2` is the Line x2 — always ODD, because
 * create_pool rejects an even line so that a push is arithmetically impossible (lib.rs:50-58).
 * It is only a fallback: the real menu comes from TxLINE (`TxlineLive.goalLines` /
 * `handicapLines`) and grows on its own as the feed quotes more lines.
 *
 * Total Corners and Total Cards are deliberately ABSENT. The stat keys they settle from
 * (7/8 and 3–6) have never appeared in a live payload — probed 2026-07-19, `Stats` came back
 * `{}` — and `finalisedFeedLines` reads missing keys as 0, which settles every such Pool
 * "Under" with no error anywhere. The PoolType variants stay in the program so existing Pools
 * still decode; they are simply not offered. */
export interface MarketSpec {
  poolType: PoolTypeName;
  label: string;
  hasLine: boolean;
  fallbackLinesX2: number[];
  /** Which `TxlineLive` field carries this market's Line menu, when the feed quotes one. */
  linesKey?: "goalLines" | "handicapLines";
}

export const MARKETS: MarketSpec[] = [
  { poolType: "matchWinner", label: "Match Winner", hasLine: false, fallbackLinesX2: [0] },
  { poolType: "totalGoals", label: "Total Goals", hasLine: true, fallbackLinesX2: [3, 5], linesKey: "goalLines" },
  { poolType: "handicap", label: "Handicap", hasLine: true, fallbackLinesX2: [-1, 1], linesKey: "handicapLines" },
];

/** The Line menu for a market: whatever TxLINE currently quotes, else the fallback. The feed
 * warms up over ~a minute, so an empty list is "not yet", not "none exist" (txline.ts). */
export function marketLines(spec: MarketSpec, live: Pick<TxlineLive, "goalLines" | "handicapLines">): number[] {
  if (!spec.hasLine) return [0];
  const quoted = spec.linesKey ? live[spec.linesKey] : undefined;
  return quoted?.length ? quoted : spec.fallbackLinesX2;
}

/** A signed half-integer Line, always written with an explicit sign for Handicap ("-1.5",
 * "+1.5") — an unsigned "1.5" would not say which team is giving goals away. */
export function formatLine(lineX2: number, signed: boolean): string {
  const line = lineX2 / 2;
  return signed && line > 0 ? `+${line}` : `${line}`;
}

/** Markets no longer offered, but still on-chain in Pools created before they were withdrawn.
 * A settled Corners Pool must still render a readable Proof Receipt and claim page. */
const RETIRED_LABEL: Partial<Record<PoolTypeName, string>> = {
  totalCorners: "Total Corners",
  totalCards: "Total Cards",
};

export function marketLabel(poolType: PoolTypeName, lineX2: number): string {
  const spec = MARKETS.find((m) => m.poolType === poolType);
  if (!spec) {
    const retired = RETIRED_LABEL[poolType];
    return retired ? `${retired} O/U ${formatLine(lineX2, false)}` : poolType;
  }
  if (!spec.hasLine) return spec.label;
  if (poolType === "handicap") return `${spec.label} ${formatLine(lineX2, true)}`;
  return `${spec.label} O/U ${formatLine(lineX2, false)}`;
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

/** Half-integer Lines a market can offer, as line×2 (so always odd). O/U runs 0.5–6.5;
 * Handicap runs −2.5…+2.5 and skips 0, which is a draw-no-bet, not a handicap. */
function lineRangeX2(poolType: PoolTypeName): number[] {
  if (poolType === "handicap") return [-5, -3, -1, 1, 3, 5];
  return [1, 3, 5, 7, 9, 11, 13];
}

/**
 * Every Line the slider offers for a market, ascending: what TxLINE quotes, what already
 * holds money, and a standard half-integer spread.
 *
 * The feed is not the limit. It quoted ZERO usable full-match goal Lines on the devnet slate
 * (probed 2026-07-19: full-match O/U came back 3.0 and 3.25 — a push and a quarter-line, both
 * rejected), so a menu built only from quotes would strand a Group on two fallbacks. The
 * program settles any odd line×2, so the range is ours to offer; quotes only mark which ones
 * the market itself likes.
 *
 * `openLinesX2` is unioned in unconditionally: a Line someone already has money on must stay
 * reachable even if it is outside the range and the feed has stopped quoting it.
 */
export function lineMenu(spec: MarketSpec, quoted: number[], openLinesX2: number[]): number[] {
  if (!spec.hasLine) return [0];
  const all = new Set<number>([...lineRangeX2(spec.poolType), ...quoted, ...openLinesX2]);
  // Guard the range union: a quoted or on-chain Line that isn't a half-integer can't settle.
  return [...all].filter((x2) => Math.abs(x2 % 2) === 1).sort((a, b) => a - b);
}
