"use client";

import { fixtureById, teamFlag } from "@/lib/fixtures";
import { formatUsdc } from "@/lib/format";
import { marketLabel, type Match } from "@/lib/markets";

const STATE_LABEL: Record<Match["state"], string> = {
  open: "OPEN", locked: "LIVE", settled: "SETTLED", void: "VOID",
};

/** One Match in the grid: the fixture, what's riding on it across every market, and how many
 * markets are live. State always carries a text label, never colour alone (PRODUCT.md). */
export function MatchCard({ match, onOpen }: { match: Match; onOpen: (m: Match) => void }) {
  const fixture = fixtureById(match.fixtureId);
  const n = match.pools.length;

  return (
    <button className={`pool-card match-card is-${match.state}`} onClick={() => onOpen(match)}>
      <div className="pc-body">
        <div className="pc-head">
          <strong className="pc-teams">
            {fixture ? (
              <>
                <span aria-hidden="true">{teamFlag(fixture.home)}</span> {fixture.home}
                {" v "}
                <span aria-hidden="true">{teamFlag(fixture.away)}</span> {fixture.away}
              </>
            ) : (
              `Fixture ${match.fixtureId.toString()}`
            )}
          </strong>
          <span className={`badge ${match.state}`}>{STATE_LABEL[match.state]}</span>
        </div>

        <div className="pc-cells">
          <div className="pc-cell">
            <span className="label">Total pot</span>
            <span className="num">${formatUsdc(match.pot)}</span>
          </div>
          <div className="pc-cell">
            <span className="label">Markets</span>
            <span className="num">{n}</span>
          </div>
        </div>

        <ul className="match-markets">
          {match.pools.map((p) => (
            <li key={p.address.toBase58()}>
              <span>{marketLabel(p.poolType, p.lineX2)}</span>
              <span className="mono">${formatUsdc(p.pot)}</span>
            </li>
          ))}
        </ul>
      </div>
    </button>
  );
}
