"use client";

import type { PublicKey } from "@solana/web3.js";
import type { PoolAccount, PoolTypeName } from "@/lib/anchorClient";
import { formatUsdc } from "@/lib/format";
import { marketLabel, type MarketSpec } from "@/lib/markets";

/** Identifies which Pool a Back click targets — the address (if this section already has one)
 * plus the market shape needed to open a Pool when it doesn't. Carrying the address is the
 * whole fix: two Pools can share (poolType, lineX2), so matching on those alone can route a
 * stake to the wrong one. */
export type BackTarget = { pool: PublicKey | null; poolType: PoolTypeName; lineX2: number };

/**
 * One market on a Match. An unopened market is a first-class state, not an absence: the
 * market Pool is created lazily by whoever backs it first, so this renders the invitation
 * rather than hiding the market entirely.
 */
export function MarketSection({
  spec, lineX2, pool, labels, myEntries, stake, busy, onBack,
}: {
  spec: MarketSpec;
  lineX2: number;
  pool: PoolAccount | null;
  labels: string[];
  myEntries: Record<number, bigint | undefined>;
  stake: bigint;
  busy: boolean;
  onBack: (target: BackTarget, outcome: number) => Promise<void>;
}) {
  const open = pool === null || pool.state === "open";
  const headingId = `mkt-${spec.poolType}-${lineX2}`;

  return (
    <section className="market-section" aria-labelledby={headingId}>
      <div className="market-head">
        <h3 id={headingId} className="market-title">
          {marketLabel(spec.poolType, lineX2)}
        </h3>
        <span className="badge">{pool ? `$${formatUsdc(pool.pot)} pot` : "not opened yet"}</span>
      </div>

      {!spec.hasOdds && (
        <p className="market-note">
          No crowd odds for this market — it settles from proven match stats.
        </p>
      )}

      <div className="outcome-grid">
        {labels.map((label, o) => {
          const mine = myEntries[o];
          return (
            <div key={o} className={`outcome${mine ? " mine" : ""}`}>
              <span className="outcome-label">{label}</span>
              {pool && <span className="odds">${formatUsdc(pool.outcomeTotals[o] ?? 0n)}</span>}
              <span className={`mine-tag${mine ? "" : " empty"}`}>
                {mine ? `You're in $${formatUsdc(mine)}` : "Not in yet"}
              </span>
              <button
                disabled={busy || !open}
                onClick={() => onBack({ pool: pool?.address ?? null, poolType: spec.poolType, lineX2 }, o)}
              >
                Back ${formatUsdc(stake)}
              </button>
            </div>
          );
        })}
      </div>

      {pool === null && (
        <p className="market-note">Nobody has opened this market yet — back it to start it.</p>
      )}
    </section>
  );
}
