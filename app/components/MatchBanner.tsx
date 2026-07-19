"use client";

import type { PoolState, PoolTypeName } from "@/lib/anchorClient";
import { poolTypeLabel, teamFlag, type Fixture } from "@/lib/fixtures";
import { formatUsdc } from "@/lib/format";

const STATE_LABEL: Record<PoolState, string> = {
  open: "Open",
  locked: "Locked",
  settled: "Settled",
  void: "Void",
};

/**
 * Who is playing, what Pool this is, and the money on it — the header for every Pool state.
 * A settled Pool used to open on a bare "ENGLAND WIN" chip with the Fixture nowhere in sight;
 * the match identity is the one thing that should never depend on the Pool still being live.
 */
export function MatchBanner({
  fixture,
  fixtureId,
  poolType,
  lineX2,
  state,
  pot,
  markets,
}: {
  fixture?: Fixture;
  fixtureId: bigint;
  /** Omitted on a Match banner — a Match spans several markets, so there is no single one. */
  poolType?: PoolTypeName;
  lineX2?: number;
  state: PoolState;
  /** Live rolling pot while Open; the final pot once Settled. */
  pot: bigint;
  /** Match banner only: how many markets are open on this Fixture. */
  markets?: number;
}) {
  const done = state === "settled" || state === "void";
  return (
    <div className="match-banner">
      <div className="stack" style={{ gap: 10 }}>
        {fixture ? (
          <div className="match-teams">
            <span className="team">
              <span className="flag" aria-hidden="true">{teamFlag(fixture.home)}</span>
              <span className="tname">{fixture.home}</span>
            </span>
            <span className="vs" aria-hidden="true">vs</span>
            <span className="team">
              <span className="flag" aria-hidden="true">{teamFlag(fixture.away)}</span>
              <span className="tname">{fixture.away}</span>
            </span>
          </div>
        ) : (
          <div className="match-name">Fixture {fixtureId.toString()}</div>
        )}
        <div className="row" style={{ flexWrap: "wrap" }}>
          <span className="chip-id">
            {poolType !== undefined
              ? poolTypeLabel(poolType, lineX2 ?? 0)
              : `${markets ?? 0} market${markets === 1 ? "" : "s"}`}
            {" · "}FX-{fixtureId.toString()}
          </span>
          <span className={`badge ${state}`}>{STATE_LABEL[state]}</span>
        </div>
      </div>
      <div className="prize-tag">
        <div className="label">{done ? "Final prize pool" : "Total prize pool"}</div>
        {/* Open: rolls up rather than snapping, so a fresh Entry is felt. */}
        <div className="pot">${formatUsdc(pot)}</div>
        <div className="prize-foot">{done ? "paid out to the winners 🏆" : "grows with every bet 🤑"}</div>
      </div>
    </div>
  );
}
