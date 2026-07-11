"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useFinalWhistle } from "@/lib/useFinalWhistle";
import type { PoolAccount, PoolState } from "@/lib/anchorClient";
import { fixtureById, outcomeLabels } from "@/lib/fixtures";
import { decimalOdds, formatUsdc, parseUsdc } from "@/lib/format";

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

/** Live view of one Pool: pot, per-Outcome totals + Reference Odds, place Entry, and
 * post-settlement payout (auto-claimed) or refund. */
export function PoolView({ address }: { address: string }) {
  const { client } = useFinalWhistle();
  const poolKey = new PublicKey(address);
  const [pool, setPool] = useState<PoolAccount | null>(null);
  const [myEntries, setMyEntries] = useState<(bigint | null)[]>([null, null, null]);
  const [amount, setAmount] = useState("5");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoClaimed = useRef(false);

  const refresh = useCallback(async () => {
    if (!client) return;
    try {
      const p = await client.fetchPool(poolKey);
      setPool(p);
      const entries = await Promise.all([0, 1, 2].map((o) => client.fetchEntryAmount(poolKey, o)));
      setMyEntries(entries);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [client, address]);

  // Poll for "live" pot / totals / state (T8 replaces polling with the rented realtime Feed).
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, [refresh]);

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
  const labels = fixture ? outcomeLabels(fixture) : ["Home win", "Draw", "Away win"];
  const probs = fixture?.referenceProbabilities ?? [0, 0, 0];

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="panel">
        <div className="row between">
          <h1>{fixture ? `${fixture.home} vs ${fixture.away}` : `Fixture ${pool.fixtureId}`}</h1>
          <span className={`badge ${pool.state}`}>{STATE_LABEL[pool.state]}</span>
        </div>
        <div className="muted">Match Winner (1X2) · Fixture {pool.fixtureId.toString()}</div>
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
        {([0, 1, 2] as const).map((o) => {
          const isWinner = pool.state === "settled" && pool.winningOutcome === o;
          const mine = myEntries[o];
          return (
            <div key={o} className={`outcome${isWinner ? " win" : ""}`}>
              <div className="stack" style={{ gap: 2 }}>
                <strong>{labels[o]}</strong>
                <span className="odds">
                  Reference Odds {decimalOdds(probs[o])} · Entries ${formatUsdc(pool.outcomeTotals[o])}
                  {mine ? ` · yours $${formatUsdc(mine)}` : ""}
                </span>
              </div>
              {pool.state === "open" ? (
                <button
                  className="secondary"
                  disabled={busy || !client}
                  onClick={() => act(() => client!.placeEntry(poolKey, o, parseUsdc(amount)))}
                >
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
    </div>
  );
}
