"use client";

import Link from "next/link";
import type { PublicKey } from "@solana/web3.js";
import type { PoolAccount, PoolTypeName } from "@/lib/anchorClient";
import { formatUsdc } from "@/lib/format";
import { formatLine, marketLabel, type MarketSpec } from "@/lib/markets";
import { Slider } from "@/components/ui/slider";

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
  spec, lineX2, pool, labels, myEntries, stake, busy, canOpen, onBack, lines, onLineChange, openLines,
}: {
  spec: MarketSpec;
  lineX2: number;
  pool: PoolAccount | null;
  /** Every Line this market offers, ascending. One entry = no slider. */
  lines: number[];
  onLineChange: (lineX2: number) => void;
  /** Lines that already hold money. Shown as jump-chips so a Pool can never be stranded
   * behind a slider the user has no reason to drag to. */
  openLines: Array<{ lineX2: number; pot: bigint }>;
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

  // Why this market can't take a stake right now, in the user's terms. Every branch names a
  // real Pool state, and the two terminal ones point at the money rather than dead-ending.
  const closedReason =
    pool === null
      ? "Kicked off — market closed. This market was never opened, so it can't be backed."
      : pool.state === "locked"
        ? "Kicked off — betting is closed. Waiting on the final whistle to settle this market."
        : pool.state === "void"
          ? "Voided — every stake in this market was refunded in full. Open it to claim yours."
          : "Settled — this market has paid out. Open it to see the proof and claim.";
  // Keyed by Pool address once one exists: two Pools can share (poolType, lineX2), and a
  // duplicated id would point every one of their `aria-labelledby` at the first heading.
  const headingId = pool ? `mkt-${pool.address.toBase58()}` : `mkt-${spec.poolType}-new-${lineX2}`;

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

      {spec.hasLine && lines.length > 1 && (
        <div className="line-picker">
          <Slider
            id={`${headingId}-line`}
            className="line-range"
            min={0}
            max={lines.length - 1}
            step={1}
            value={[Math.max(0, lines.indexOf(lineX2))]}
            onValueChange={([i]) => onLineChange(lines[i])}
            // The slider's own value is a menu INDEX; without this a screen reader announces
            // "3 of 6" instead of the Line being staked on.
            aria-label={`${spec.label} line`}
            aria-valuetext={formatLine(lineX2, spec.poolType === "handicap")}
            disabled={busy}
          />
          <output className="line-value" htmlFor={`${headingId}-line`}>
            {formatLine(lineX2, spec.poolType === "handicap")}
          </output>
        </div>
      )}

      {spec.hasLine && openLines.length > 1 && (
        <p className="line-open-chips">
          <span className="line-open-label">Money already on:</span>
          {openLines.map((l) => (
            <button
              key={l.lineX2}
              type="button"
              className={`line-chip${l.lineX2 === lineX2 ? " active" : ""}`}
              onClick={() => onLineChange(l.lineX2)}
            >
              {formatLine(l.lineX2, spec.poolType === "handicap")} · ${formatUsdc(l.pot)}
            </button>
          ))}
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
                disabled={busy || !open || stake <= 0n}
                onClick={() => onBack({ pool: pool?.address ?? null, poolType: spec.poolType, lineX2 }, o)}
              >
                Back ${formatUsdc(stake)}
              </button>
            </div>
          );
        })}
      </div>

      {/* Every disabled state says WHY. A greyed-out Back button with no sentence beside it
          reads as a broken app — the user cannot tell a Voided Pool from a bug, and this is a
          money surface, so silence is the worst option. When the market is backable there is
          no note: the badge and the buttons already carry it. */}
      {!open && <p className="market-note">{closedReason}</p>}
    </section>
  );
}
