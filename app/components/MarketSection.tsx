"use client";

import Link from "next/link";
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
  spec, lineX2, pool, labels, myEntries, stake, busy, canOpen, onBack,
}: {
  spec: MarketSpec;
  lineX2: number;
  pool: PoolAccount | null;
  /** Whether the FIXTURE is still pre-kickoff. Gates unopened markets only — a Pool that
   * exists on-chain is governed by its own `state`, which the program owns. */
  canOpen: boolean;
  labels: string[];
  myEntries: Record<number, bigint | undefined>;
  stake: bigint;
  busy: boolean;
  onBack: (target: BackTarget, outcome: number) => Promise<void>;
}) {
  // An unopened market would otherwise be permanently "open": creating a Pool now would stamp a
  // kickoff ~90s out on a match whose result is already partly known. Gate it on the fixture.
  const open = pool === null ? canOpen : pool.state === "open";
  const terminal = pool !== null && (pool.state === "settled" || pool.state === "void");
  const headingId = `mkt-${spec.poolType}-${lineX2}`;

  return (
    <section className="market-section" aria-labelledby={headingId}>
      <div className="market-head">
        <h3 id={headingId} className="market-title">
          {marketLabel(spec.poolType, lineX2)}
        </h3>
        <span className="badge">{pool ? `$${formatUsdc(pool.pot)} pot` : "not opened yet"}</span>
        {pool && (
          // The claim UI lives on the Pool page — without this link a winner has no route to
          // their money, since nothing else in the app points at /pool/<address>.
          <Link className="market-link" href={`/pool/${pool.address.toBase58()}`}>
            {terminal ? "View result & claim ↗" : "Open market ↗"}
          </Link>
        )}
      </div>

      {!spec.hasOdds && (
        <p className="market-note">
          No crowd odds for this market — it settles from proven match stats.
        </p>
      )}

      <div className="outcome-grid">
        {labels.map((label, o) => {
          const mine = (myEntries[o] ?? 0n) > 0n;
          return (
            <div key={o} className={`outcome${mine ? " mine" : ""}`}>
              <span className="outcome-label">{label}</span>
              {pool && <span className="odds">${formatUsdc(pool.outcomeTotals[o] ?? 0n)}</span>}
              <span className={`mine-tag${mine ? "" : " empty"}`}>
                {mine ? `You're in $${formatUsdc(myEntries[o] ?? 0n)}` : "Not in yet"}
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

      {/* Only the closed case needs prose. When the market is open the badge already says
          "not opened yet" and the buttons say "Back $5" — a third sentence repeating that was
          noise, and it was what made each section feel crowded. */}
      {pool === null && !canOpen && (
        <p className="market-note">
          Kicked off — market closed. This market was never opened, so it can&rsquo;t be backed.
        </p>
      )}
    </section>
  );
}
