"use client";

import { fixtureById, poolOutcomeLabels } from "@/lib/fixtures";
import { formatUsdc } from "@/lib/format";
import { marketLabel, type Match } from "@/lib/markets";
import { ProofReceipt } from "./ProofReceipt";

/**
 * The Match's settlement. Every market settled from ONE Score Proof, so the verification
 * renders once (via ProofReceipt on any settled Pool) and each market contributes a result
 * row. Markets still settling are shown as pending — never implied to be proven (a Match
 * must never read as fully proven while any market is still settling).
 */
export function MatchReceipt({ match }: { match: Match }) {
  const fixture = fixtureById(match.fixtureId);
  const settled = match.pools.filter((p) => p.state === "settled");
  if (settled.length === 0) return null;

  return (
    <div className="stack" style={{ gap: 12 }}>
      <ProofReceipt
        address={settled[0].address.toBase58()}
        fixtureId={match.fixtureId}
        poolType={settled[0].poolType}
        lineX2={settled[0].lineX2}
      />

      <div className="panel">
        <h3 className="section-title">Every market on this Match</h3>
        <ul className="match-results">
          {match.pools.map((p) => {
            const labels = poolOutcomeLabels(p.poolType, p.lineX2, fixture);
            const result =
              p.state === "settled" && p.winningOutcome !== null
                ? labels[p.winningOutcome]
                : p.state === "void"
                  ? "Void — everyone refunded"
                  : "Still settling…";
            return (
              <li key={p.address.toBase58()}>
                <span>{marketLabel(p.poolType, p.lineX2)}</span>
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
