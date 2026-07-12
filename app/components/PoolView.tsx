"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useFinalWhistle } from "@/lib/useFinalWhistle";
import { useFeed } from "@/lib/feed";
import type { PoolAccount, PoolState } from "@/lib/anchorClient";
import { fixtureById, poolOutcomeLabels, poolTypeLabel } from "@/lib/fixtures";
import { decimalOdds, formatUsdc, parseUsdc } from "@/lib/format";
import { Feed } from "./Feed";
import { ProofReceipt } from "./ProofReceipt";

const STATE_LABEL: Record<PoolState, string> = {
  open: "Open",
  locked: "Locked",
  settled: "Settled",
  void: "Void",
};

const VOID_REASON_LABEL: Record<string, string> = {
  abandoned: "the Fixture was abandoned",
  noWinningEntries: "no Entries backed the proven Outcome",
  expired: "the Fixture never finalised in time",
};

const SYSTEM_POST: Partial<Record<PoolState, string>> = {
  locked: "⏱️ Pool Locked at kickoff — Entries are frozen.",
  settled: "✅ Pool Settled — the Proof Receipt is in.",
  void: "↩️ Pool Voided — every Entry is refunded in full.",
};

function short(s: string): string {
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

/** Live view of one Pool: pot, per-Outcome totals + Reference Odds, place Entry, the live
 * Feed, and — once Settled — the Proof Receipt. */
export function PoolView({ address }: { address: string }) {
  const { client, email, address: wallet } = useFinalWhistle();
  const displayName = email ?? (wallet ? short(wallet) : "anon");
  const feed = useFeed(address, displayName);
  const poolKey = new PublicKey(address);
  const [pool, setPool] = useState<PoolAccount | null>(null);
  const [myEntries, setMyEntries] = useState<(bigint | null)[]>([null, null, null]);
  const [amount, setAmount] = useState("5");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoClaimed = useRef(false);
  const lastState = useRef<PoolState | null>(null);

  const refresh = useCallback(async () => {
    if (!client) return;
    try {
      const p = await client.fetchPool(poolKey);
      setPool(p);
      setMyEntries(await Promise.all([0, 1, 2].map((o) => client.fetchEntryAmount(poolKey, o))));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [client, address]);

  // Poll for "live" pot / totals / state and auto-post Pool-action transitions to the Feed.
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    if (!pool) return;
    if (lastState.current && lastState.current !== pool.state) {
      const line = SYSTEM_POST[pool.state];
      if (line) feed.postSystem(`sys:${address}:${pool.state}`, line);
      // Fixture events auto-post as the match plays. Stand-in for TxLINE's scores stream
      // (no live feed here) — scripted events replay once when the Pool Locks.
      if (pool.state === "locked") {
        const fx = fixtureById(pool.fixtureId);
        fx?.matchEvents?.forEach((ev, i) => feed.postSystem(`fx:${address}:${i}`, ev));
      }
    }
    lastState.current = pool.state;
  }, [pool, feed, address]);

  // Auto-claim the winning payout once the Pool Settles (ADR — "feels automatic").
  useEffect(() => {
    if (!client || !pool || autoClaimed.current) return;
    if (pool.state === "settled" && pool.winningOutcome !== null && myEntries[pool.winningOutcome]) {
      autoClaimed.current = true;
      client
        .claimPayout(poolKey, pool.winningOutcome)
        .then(refresh)
        .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    }
  }, [client, pool, myEntries, refresh, address]);

  if (!pool) return <div className="panel muted">Loading Pool…</div>;

  const fixture = fixtureById(pool.fixtureId);
  const labels = poolOutcomeLabels(pool.poolType, pool.lineX2, fixture);
  const probs = fixture?.referenceProbabilities ?? [0, 0, 0];
  const showOdds = pool.poolType === "matchWinner"; // the mock only carries 1X2 Reference Odds

  async function act(fn: () => Promise<unknown>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function back(outcome: number) {
    if (!client) return;
    const entered = parseUsdc(amount);
    // Only announce the Entry to the Feed once it actually landed on-chain.
    if (await act(() => client.placeEntry(poolKey, outcome, entered))) {
      feed.postSystem(`entry:${Date.now()}`, `💸 ${displayName} backed $${amount} on ${labels[outcome]}`);
    }
  }

  return (
    <div className="stack">
      <div className="panel">
        <div className="row between">
          <h1>{fixture ? `${fixture.home} vs ${fixture.away}` : `Fixture ${pool.fixtureId}`}</h1>
          <span className={`badge ${pool.state}`}>{STATE_LABEL[pool.state]}</span>
        </div>
        <div className="muted">{poolTypeLabel(pool.poolType, pool.lineX2)} · Fixture {pool.fixtureId.toString()}</div>
        <div className="row between" style={{ marginTop: 14 }}>
          <div>
            <div className="muted" style={{ fontSize: 13 }}>Pot</div>
            <div className="pot">${formatUsdc(pool.pot)}</div>
          </div>
          {pool.state === "void" && (
            <div className="error">
              Void — {pool.voidReason ? VOID_REASON_LABEL[pool.voidReason] : "no paying Outcome"}. Every
              Entry is refunded in full.
            </div>
          )}
        </div>
      </div>

      <div className="panel stack">
        <h2>Outcomes</h2>
        {labels.map((label, o) => {
          const isWinner = pool.state === "settled" && pool.winningOutcome === o;
          const mine = myEntries[o];
          return (
            <div key={o} className={`outcome${isWinner ? " win" : ""}`}>
              <div className="stack" style={{ gap: 2 }}>
                <strong>{label}</strong>
                <span className="odds">
                  {showOdds ? `Reference Odds ${decimalOdds(probs[o])} · ` : ""}Entries $
                  {formatUsdc(pool.outcomeTotals[o])}
                  {mine ? ` · yours $${formatUsdc(mine)}` : ""}
                </span>
              </div>
              {pool.state === "open" ? (
                <button className="secondary" disabled={busy || !client} onClick={() => back(o)}>
                  Back ${amount}
                </button>
              ) : (
                <span />
              )}
              {pool.state === "void" && mine ? (
                <button disabled={busy || !client} onClick={() => act(() => client!.claimRefund(poolKey, o))}>
                  Refund ${formatUsdc(mine)}
                </button>
              ) : (
                <span />
              )}
            </div>
          );
        })}
        {pool.state === "open" && (
          <div className="row">
            <span className="muted" style={{ fontSize: 13 }}>Entry amount (USDC)</span>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 90 }} />
          </div>
        )}
        {pool.state === "settled" && pool.winningOutcome !== null && myEntries[pool.winningOutcome] && (
          <p className="entry-note">Your payout is being claimed automatically…</p>
        )}
        {error && <p className="error">{error}</p>}
      </div>

      {pool.state === "settled" && (
        <ProofReceipt address={address} fixtureId={pool.fixtureId} poolType={pool.poolType} lineX2={pool.lineX2} />
      )}

      <Feed feed={feed} />
    </div>
  );
}
