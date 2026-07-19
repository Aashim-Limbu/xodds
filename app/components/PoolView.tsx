"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useFinalWhistle } from "@/lib/useFinalWhistle";
import { useFeed } from "@/lib/feed";
import type { PoolAccount, PoolState } from "@/lib/anchorClient";
import { fixtureById, poolOutcomeLabels, poolTypeLabel } from "@/lib/fixtures";
import { useFixtures, useTxlineLive } from "@/lib/useTxlineLive";
import { recordResult } from "@/lib/useLeaderboard";
import { decimalOdds, formatUsdc, parseUsdc } from "@/lib/format";
import { useMyName } from "@/lib/useMyName";
import { friendlyError } from "@/lib/errors";
import { KICKOFF_OFFSET_SECONDS } from "@/lib/config";
import { Feed } from "./Feed";
import { SettledPool } from "@/components/SettledPool";

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

/** Live view of one Pool: pot, per-Outcome totals + Reference Odds, place Entry, the live
 * Feed, and — once Settled — the Proof Receipt. */
export function PoolView({ address }: { address: string }) {
  const { client, address: wallet, getAccessToken } = useFinalWhistle();
  // Hydrate real TxLINE fixtures on direct /pool/<id> loads — without this, fixtureById only
  // knows the static demo slate and real pools render as "Fixture <id>" (Codex P2).
  useFixtures();
  const { name: displayName } = useMyName();
  const poolKey = new PublicKey(address);
  const [pool, setPool] = useState<PoolAccount | null>(null);
  // Feed is per-Group (CONTEXT.md): every Pool in the Group shares one stream, so system
  // posts carry the Fixture for context. "" until the Pool loads -> hook waits.
  const feed = useFeed(pool ? `group:${pool.group.toBase58()}` : "", displayName, wallet);
  const [myEntries, setMyEntries] = useState<(bigint | null)[]>([null, null, null]);
  const [amount, setAmount] = useState("5");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimStatus, setClaimStatus] = useState<"idle" | "claiming" | "paid">("idle");
  const [paidAmount, setPaidAmount] = useState<bigint | null>(null);
  const claimInFlight = useRef(false);
  const lastState = useRef<PoolState | null>(null);
  const recorded = useRef(false); // guards the one leaderboard write per settled Pool view
  // Real TxLINE Reference Odds + Feed lines when a token is configured; {} (static fallback) otherwise.
  const live = useTxlineLive(pool?.fixtureId ?? 0n);

  // The shared Pool (pot / totals / state) via the cached server route — so N tabs on the same
  // Pool collapse to one chain read per few seconds instead of N direct RPC polls.
  const refreshPool = useCallback(async () => {
    if (!client) return;
    try {
      setPool(await client.fetchPoolCached(poolKey));
    } catch (e) {
      setError(friendlyError(e));
    }
  }, [client, address]);

  // Entries are per-User (each wallet reads different PDAs) and only change when THIS User acts,
  // so read them on mount / after own actions — not on the 4s poll. That keeps the poll to one
  // shared, cached Pool read instead of 4 direct RPC calls per tab.
  const refreshEntries = useCallback(async () => {
    if (!client) return;
    try {
      setMyEntries(await Promise.all([0, 1, 2].map((o) => client.fetchEntryAmount(poolKey, o))));
    } catch {
      // a transient miss just delays the claim/refund affordance; the next action re-reads
    }
  }, [client, address]);

  const refresh = useCallback(async () => {
    await Promise.all([refreshPool(), refreshEntries()]);
  }, [refreshPool, refreshEntries]);

  // Poll the shared Pool state and auto-post Pool-action transitions to the Feed.
  useEffect(() => {
    refreshPool();
    const id = setInterval(refreshPool, 4000);
    return () => clearInterval(id);
  }, [refreshPool]);

  // Load this User's Entries once (and on wallet change); own actions re-read via refresh().
  useEffect(() => {
    refreshEntries();
  }, [refreshEntries]);

  useEffect(() => {
    if (!pool) return;
    if (lastState.current && lastState.current !== pool.state) {
      const line = SYSTEM_POST[pool.state];
      const fx = fixtureById(pool.fixtureId);
      const tag = fx ? `${fx.home} vs ${fx.away} — ` : "";
      if (line) feed.postSystem(`sys:${address}:${pool.state}`, `${tag}${line}`);
      // Fixture events auto-post as the match plays. Stand-in for TxLINE's scores stream
      // (no live feed here) — scripted events replay once when the Pool Locks.
      if (pool.state === "locked") {
        const events = live.matchEvents ?? fx?.matchEvents;
        events?.forEach((ev, i) => feed.postSystem(`fx:${address}:${i}`, ev));
      }
    }
    lastState.current = pool.state;
  }, [pool, feed, address, live]);

  // Claim the winning payout. Used by both the auto-claim effect and the manual button, so a
  // flaky RPC leaves a retry affordance instead of stranding the winner. Only latches on success.
  const doClaim = useCallback(async () => {
    if (!client || !pool || pool.state !== "settled" || pool.winningOutcome === null) return;
    const outcome = pool.winningOutcome;
    const myEntry = myEntries[outcome];
    if (!myEntry || claimInFlight.current) return;
    claimInFlight.current = true;
    setClaimStatus("claiming");
    setError(null);
    const total = pool.outcomeTotals[outcome];
    // Parimutuel payout = myEntry / winning_total × pot — captured before the claim closes the Entry.
    const payout = total > 0n ? (myEntry * pool.pot) / total : myEntry;
    try {
      await client.claimPayout(poolKey, outcome);
      setPaidAmount(payout);
      setClaimStatus("paid");
      feed.postSystem(`won:${address}`, `🏆 ${displayName} won $${formatUsdc(payout)}`);
      await refresh();
    } catch (e) {
      setClaimStatus("idle"); // surface the manual "Claim" button to retry
      setError(friendlyError(e));
    } finally {
      claimInFlight.current = false;
    }
  }, [client, pool, myEntries, refresh, address, feed, displayName]);

  // Auto-claim once the Pool Settles (ADR — "feels automatic"); the button below covers retries.
  useEffect(() => {
    if (!pool || pool.state !== "settled" || pool.winningOutcome === null) return;
    if (!myEntries[pool.winningOutcome] || claimStatus !== "idle" || claimInFlight.current) return;
    doClaim();
  }, [pool, myEntries, claimStatus, doClaim]);

  // Record this User's result to the Group leaderboard, once, when the Pool Settles — winning
  // Entries are closed on claim (ADR-0004), so standings are captured here, not read from chain.
  useEffect(() => {
    if (!pool || pool.state !== "settled" || pool.winningOutcome === null || recorded.current || !wallet) return;
    const staked = myEntries.reduce((sum: bigint, e) => sum + (e ?? 0n), 0n);
    if (staked === 0n) return; // this User didn't back this Pool
    recorded.current = true;
    const winEntry = myEntries[pool.winningOutcome] ?? 0n;
    const winTotal = pool.outcomeTotals[pool.winningOutcome];
    const won = winEntry > 0n && winTotal > 0n ? (winEntry * pool.pot) / winTotal : 0n;
    const channel = `group:${pool.group.toBase58()}`;
    void getAccessToken()
      .then((t) => (t ? recordResult(channel, { pool: address, wallet, name: displayName, staked, won, ts: Date.now() }, t) : null))
      .then((streak) => {
        if (streak && streak >= 3) feed.postSystem(`streak:${wallet}:${streak}`, `🔥 ${displayName} is on a ${streak}-win streak!`);
      });
  }, [pool, myEntries, wallet, address, displayName, feed, getAccessToken]);

  if (!pool) return <div className="panel muted">Loading Pool…</div>;

  const fixture = fixtureById(pool.fixtureId);
  const labels = poolOutcomeLabels(pool.poolType, pool.lineX2, fixture);
  const probs = live.referenceProbabilities ?? fixture?.referenceProbabilities ?? [0, 0, 0];
  const showOdds = pool.poolType === "matchWinner"; // the mock only carries 1X2 Reference Odds

  const winning = pool.winningOutcome;
  const myWinEntry = pool.state === "settled" && winning !== null ? myEntries[winning] : null;
  const winTotal = winning !== null ? pool.outcomeTotals[winning] : 0n;
  const myPayout = myWinEntry && winTotal > 0n ? (myWinEntry * pool.pot) / winTotal : myWinEntry ?? 0n;

  if (pool.state === "settled") {
    return (
      <div className="pool-layout">
        <SettledPool
          pool={pool}
          address={address}
          labels={labels}
          myEntries={myEntries.map((e) => e ?? undefined)}
          myPayout={myPayout}
          claimStatus={claimStatus}
          paidAmount={paidAmount}
          busy={busy}
          canAct={!!client}
          onClaim={doClaim}
          onRematch={rematch}
          error={error}
        />
        <Feed feed={feed} me={displayName} myId={wallet ?? displayName} />
      </div>
    );
  }

  async function act(fn: () => Promise<unknown>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
      return true;
    } catch (e) {
      setError(friendlyError(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  // "Run it back": recreate this Pool (same Fixture, Pool Type, and Line) with the next free
  // nonce, challenge the Group in the Feed, and jump to the new Pool.
  async function rematch() {
    if (!client || !pool) return;
    setBusy(true);
    setError(null);
    try {
      const nonce = await client.freeNonce(pool.group, pool.fixtureId, pool.poolType);
      const kickoff = Math.floor(Date.now() / 1000) + KICKOFF_OFFSET_SECONDS;
      const newPool = await client.createPool(pool.group, pool.fixtureId, nonce, kickoff, pool.poolType, pool.lineX2);
      feed.postSystem(
        `rematch:${newPool.toBase58()}`,
        `🔁 ${displayName} wants a rematch — ${poolTypeLabel(pool.poolType, pool.lineX2)} Pool is open!`,
      );
      window.location.href = `/pool/${newPool.toBase58()}`;
    } catch (e) {
      setError(friendlyError(e));
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
    <div className="pool-layout">
      <div className="stack" style={{ gap: 0 }}>
        <div style={{ marginBottom: 24 }}>
          <div className="match-banner">
            <div className="stack" style={{ gap: 10 }}>
              <div className="row" style={{ gap: 14 }}>
                <span className="sticker tilt-l" aria-hidden="true" style={{ fontSize: 52 }}>🏆</span>
                <div className="match-name">
                  {fixture ? `${fixture.home} vs ${fixture.away}` : `Fixture ${pool.fixtureId}`}
                </div>
              </div>
              <div className="row" style={{ flexWrap: "wrap" }}>
                <span className="chip-id">
                  {poolTypeLabel(pool.poolType, pool.lineX2)} · FX-{pool.fixtureId.toString()}
                </span>
                <span className={`badge ${pool.state}`}>{STATE_LABEL[pool.state]}</span>
              </div>
            </div>
            <div className="prize-tag">
              <div className="label">TOTAL PRIZE POOL</div>
              <div className="pot">${formatUsdc(pool.pot)}</div>
            </div>
          </div>
          {pool.state === "locked" && live.score && (
            <div className="live-strip" role="status">
              <span className="live-dot" aria-hidden="true" />
              <span className="live-phase">{live.score.phase}</span>
              <span className="live-score">
                {fixture?.home ?? "Home"} {live.score.home}–{live.score.away} {fixture?.away ?? "Away"}
              </span>
            </div>
          )}
          {pool.state === "void" && (
            <p className="error" style={{ marginBottom: 0 }}>
              Void — {pool.voidReason ? VOID_REASON_LABEL[pool.voidReason] : "no paying Outcome"}. Every
              Entry is refunded in full.
            </p>
          )}
        </div>

        <div className="stack" style={{ gap: 14, marginBottom: 20 }}>
          <div className="outcome-grid">
            {labels.map((label, o) => {
              const mine = myEntries[o];
              // Live parimutuel preview: if I back `stake` here, the pot and this side both
              // grow by it, and a win pays my share of the new pot.
              const stake = (() => { try { return parseUsdc(amount); } catch { return 0n; } })();
              const newPot = pool.pot + stake;
              const newSide = pool.outcomeTotals[o] + stake;
              const projected = stake > 0n && newSide > 0n ? (stake * newPot) / newSide : 0n;
              const mult = stake > 0n ? Number(projected) / Number(stake) : 0;
              const share = pool.pot > 0n ? Number((pool.outcomeTotals[o] * 100n) / pool.pot) : 0;
              return (
                <div key={o} className="outcome">
                  <span className="outcome-label">{label}</span>
                  <span className="odds">
                    {showOdds && live.referenceProbabilities && <span className="odds-live">LIVE</span>}
                    {/* Open: sharp-market odds. Locked with live data: the win-probability ticker. */}
                    {showOdds && (pool.state === "locked" && live.referenceProbabilities
                      ? `Win ${Math.round(probs[o] * 100)}% · `
                      : `Odds ${decimalOdds(probs[o])} · `)}
                    ${formatUsdc(pool.outcomeTotals[o])} in
                    {mine ? ` · yours $${formatUsdc(mine)}` : ""}
                  </span>
                  {pool.state === "open" && (
                    <>
                      <span className="pot-share" aria-label={`${share}% of the pot backs this outcome`}>
                        <span className="pot-share-bar" style={{ transform: `scaleX(${share / 100})` }} aria-hidden="true" />
                        <span className="label">{share}% of pot</span>
                      </span>
                      {stake > 0n && (
                        <span className="win-preview">
                          win ~${formatUsdc(projected)} <span className="muted">({mult.toFixed(1)}x)</span>
                        </span>
                      )}
                      <button disabled={busy || !client} onClick={() => back(o)}>
                        Back ${amount}
                      </button>
                    </>
                  )}
                  {pool.state === "void" && mine ? (
                    <button disabled={busy || !client} onClick={() => act(() => client!.claimRefund(poolKey, o))}>
                      Refund ${formatUsdc(mine)}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
          {pool.state === "open" && (
            <div className="panel row" style={{ marginBottom: 0, flexWrap: "wrap", gap: 10 }}>
              <span className="muted" style={{ fontSize: 13, fontWeight: 700 }}>Your stake</span>
              {["1", "5", "10", "25"].map((v) => (
                <button
                  key={v}
                  className={`gchip${amount === v ? " active" : ""}`}
                  aria-pressed={amount === v}
                  onClick={() => setAmount(v)}
                >
                  ${v}
                </button>
              ))}
              <label className="row" style={{ gap: 6 }}>
                <span className="label muted">custom</span>
                <input
                  value={amount}
                  inputMode="decimal"
                  aria-label="Custom stake amount (USDC)"
                  onChange={(e) => setAmount(e.target.value)}
                  style={{ width: 80 }}
                />
              </label>
            </div>
          )}
          {pool.state === "void" && (
            <button disabled={busy || !client} onClick={rematch}>
              🔁 Run it back — same Pool, new game
            </button>
          )}
          {error && <p className="error">{error}</p>}
        </div>
      </div>

      <Feed feed={feed} me={displayName} myId={wallet ?? displayName} />
    </div>
  );
}
