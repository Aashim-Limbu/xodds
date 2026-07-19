"use client";

import Link from "next/link";
import { fixtureById, poolOutcomeLabels } from "@/lib/fixtures";
import { formatUsdc } from "@/lib/format";
import { MARKETS, marketLabel, type Match } from "@/lib/markets";
import type { PoolAccount } from "@/lib/anchorClient";
import { ProofReceipt } from "./ProofReceipt";

/** Deterministic pick of which settled Pool's proof headlines the Match: canonical market
 * order first (MARKETS), then address as a stable tiebreak — never fetch order, which isn't
 * stable across page loads and would make the hero outcome flicker between markets. */
function pickHeroPool(settled: PoolAccount[]): PoolAccount {
  return [...settled].sort((a, b) => {
    const ai = MARKETS.findIndex((m) => m.poolType === a.poolType);
    const bi = MARKETS.findIndex((m) => m.poolType === b.poolType);
    if (ai !== bi) return ai - bi;
    return a.address.toBase58().localeCompare(b.address.toBase58());
  })[0];
}

/**
 * The Match's settlement. Every market settled from ONE Score Proof, so the verification
 * renders once (via ProofReceipt on any settled Pool) and each market contributes a result
 * row. Markets still settling are shown as pending — never implied to be proven (a Match
 * must never read as fully proven while any market is still settling).
 */
export function MatchReceipt({ match }: { match: Match }) {
  const fixture = fixtureById(match.fixtureId);
  const settled = match.pools.filter((p) => p.state === "settled");
  const terminal = match.pools.some((p) => p.state === "settled" || p.state === "void");
  if (!terminal) return null;

  const heroPool = settled.length > 0 ? pickHeroPool(settled) : null;

  return (
    <div className="stack" style={{ gap: 12 }}>
      {heroPool && (
        <>
          <p className="match-receipt-hero-caption">
            Proof for {marketLabel(heroPool.poolType, heroPool.lineX2)}
          </p>
          <ProofReceipt
            address={heroPool.address.toBase58()}
            fixtureId={match.fixtureId}
            poolType={heroPool.poolType}
            lineX2={heroPool.lineX2}
          />
        </>
      )}

      <div className="panel">
        <h3 className="section-title">Every market on this Match</h3>
        <ul className="match-results">
          {match.pools.map((p) => {
            const labels = poolOutcomeLabels(p.poolType, p.lineX2, fixture);
            const result =
              p.state === "settled" && p.winningOutcome !== null
                ? (labels[p.winningOutcome] ?? "Unknown outcome")
                : p.state === "void"
                  ? "Void — everyone refunded"
                  : "Still settling…";
            return (
              <li key={p.address.toBase58()}>
                {/* Settled/void rows link to the Pool page — that's where the claim button is. */}
                {p.state === "settled" || p.state === "void" ? (
                  <Link href={`/pool/${p.address.toBase58()}`}>
                    {marketLabel(p.poolType, p.lineX2)} — view & claim ↗
                  </Link>
                ) : (
                  <span>{marketLabel(p.poolType, p.lineX2)}</span>
                )}
                <strong>{result}</strong>
                <span className="mono">${formatUsdc(p.pot)}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
