"use client";

import { Face } from "@/components/Avatars";
import { useEffect, useState } from "react";
import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { useAddFunds } from "@privy-io/react-auth";
import { CLUSTER, DEPOSIT_CHAIN, DEPOSIT_MINT, RPC_URL, usdcMint } from "@/lib/config";
import { computeStandings, type PoolResult, type Standing } from "@/lib/leaderboard";
import { formatUsdc } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { Progress } from "@/components/ui/progress";
import { DepositModal } from "./DepositModal";

/** The Profile tab: who you are as a bettor (career record), your money at a glance, and
 * account actions. It's user-scoped — no Group chrome, unlike the other tabs. */
export function Profile({
  email,
  wallet,
  displayName,
  onSaveName,
  onPlay,
  onSignOut,
}: {
  email: string | null;
  wallet: string | null;
  displayName: string;
  /** Persist a new display name (see useMyName) — updates the Feed/roster/leaderboard everywhere. */
  onSaveName: (name: string) => Promise<void>;
  /** Jump to the Pools tab (the Rookie nudge). */
  onPlay: () => void;
  onSignOut: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [refreshBalances, setRefreshBalances] = useState(0);
  const [fundError, setFundError] = useState<string | null>(null);
  const [showDeposit, setShowDeposit] = useState(false);
  // `useAddFunds` is v3's unified funding entry point — passing `crypto` opens the
  // deposit-address flow (address + QR), which is the one enabled in the dashboard.
  // The legacy `useFundWallet` only reaches the fiat on-ramps, which are off.
  const { addFunds } = useAddFunds();

  // Off mainnet, a deposit is a plain same-token transfer to this very wallet, so we show
  // the address and QR directly. Privy's bridging only earns its keep on mainnet, where a
  // user may turn up holding some other asset on some other chain.
  async function deposit() {
    if (!wallet) return;
    setFundError(null);
    if (CLUSTER !== "mainnet-beta") return setShowDeposit(true);
    try {
      await addFunds({
        // `asset` is the token's mint address here, not a symbol.
        destination: { address: wallet, chain: DEPOSIT_CHAIN, asset: DEPOSIT_MINT },
        crypto: {},
      });
    } catch (e) {
      console.error("[deposit] addFunds failed", e);
      const code = (e as { code?: string })?.code;
      if (code === "USER_EXITED") return; // closing the modal isn't an error
      setFundError(code ?? (e instanceof Error ? e.message : "Deposit is not available."));
    } finally {
      setRefreshBalances((n) => n + 1);
    }
  }
  const [sol, setSol] = useState<number | null>(null);
  const [usdc, setUsdc] = useState<string | null>(null);
  const [stats, setStats] = useState<Standing | null | undefined>(undefined); // undefined=loading, null=no record
  /** Last few settled Pools, oldest first — the flame strip. `won` is the paid-out amount. */
  const [recent, setRecent] = useState<Array<{ pool: string; delta: bigint }>>([]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(displayName);
  const [saving, setSaving] = useState(false);

  // Live balances — the "am I good to play?" glance.
  useEffect(() => {
    if (!wallet) return;
    const conn = new Connection(RPC_URL, "confirmed");
    const owner = new PublicKey(wallet);
    let alive = true;
    void conn.getBalance(owner).then((l) => alive && setSol(l / LAMPORTS_PER_SOL)).catch(() => {});
    void conn
      .getTokenAccountBalance(getAssociatedTokenAddressSync(usdcMint(), owner))
      .then((b) => alive && setUsdc(b.value.uiAmountString ?? "0"))
      .catch(() => alive && setUsdc("0")); // no ATA yet = unfunded
    return () => {
      alive = false;
    };
  }, [wallet, refreshBalances]);

  // Only while the deposit panel is open — an idle Profile tab has no reason to poll,
  // and public devnet RPC rate-limits hard enough already.
  useEffect(() => {
    if (!showDeposit) return;
    const id = setInterval(() => !document.hidden && setRefreshBalances((n) => n + 1), 5000);
    return () => clearInterval(id);
  }, [showDeposit]);

  // Career record: my settled-Pool results across ALL Groups (no channel filter). computeStandings
  // groups by wallet, so filtering to mine yields one standing (or none, for a Rookie).
  useEffect(() => {
    if (!wallet || !supabase) {
      setStats(null);
      return;
    }
    let alive = true;
    void supabase
      .from("pool_results")
      .select("pool, wallet, name, staked, won, ts")
      .eq("wallet", wallet)
      .then(({ data, error }) => {
        if (!alive) return;
        if (error || !data) return setStats(null);
        const results: PoolResult[] = data.map((r) => ({
          pool: r.pool,
          wallet: r.wallet,
          name: r.name,
          staked: BigInt(r.staked),
          won: BigInt(r.won),
          ts: r.ts,
        }));
        setStats(computeStandings(results).find((s) => s.wallet === wallet) ?? null);
        setRecent(
          [...results]
            .sort((a, b) => a.ts - b.ts)
            .slice(-7)
            .map((r) => ({ pool: r.pool, delta: r.won - r.staked })),
        );
      });
    return () => {
      alive = false;
    };
  }, [wallet]);

  async function copyWallet() {
    if (!wallet) return;
    await navigator.clipboard.writeText(wallet);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    const next = draft.trim();
    if (!next || next === displayName) return setEditing(false);
    setSaving(true);
    await onSaveName(next);
    setSaving(false);
    setEditing(false);
  }

  // Per-Pool profit/loss as a share of the biggest swing, so the bars read at any n.
  // A line chart needs a trend; one settled Pool has none. Bars do not lie about that.
  const bars = (() => {
    const peak = recent.reduce((m, r) => (r.delta > m ? r.delta : -r.delta > m ? -r.delta : m), 1n);
    return recent.map((r) => ({ ...r, frac: Number(r.delta < 0n ? -r.delta : r.delta) / Number(peak) }));
  })();

  const played = stats?.plays ?? 0;
  const isRookie = stats !== undefined && played === 0;
  const net = stats?.net ?? 0n;
  const netUp = net > 0n;

  return (
    <div className="panel stack profile-card" style={{ gap: 20 }}>
      {/* Identity + editable name */}
      <div className="profile-head">
        <span className="friend-avatar profile-avatar" aria-hidden="true">
          <Face id={wallet || displayName} size={56} />
        </span>
        <div className="stack" style={{ gap: 4, minWidth: 0 }}>
          {editing ? (
            <form className="name-edit" onSubmit={saveName}>
              <label className="sr-only" htmlFor="profile-name">Display name</label>
              <input
                id="profile-name"
                value={draft}
                autoFocus
                maxLength={24}
                autoComplete="off"
                onChange={(e) => setDraft(e.target.value)}
                aria-describedby="name-hint"
              />
              <button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setDraft(displayName);
                  setEditing(false);
                }}
              >
                Cancel
              </button>
              <span id="name-hint" className="sr-only">This is how your Group sees you in the Feed and leaderboard.</span>
            </form>
          ) : (
            <div className="row" style={{ gap: 8 }}>
              <h2 style={{ margin: 0, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{displayName}</h2>
              <button
                className="icon-btn"
                aria-label="Edit display name"
                onClick={() => {
                  setDraft(displayName);
                  setEditing(true);
                }}
              >
                <span className="msym">edit</span>
              </button>
            </div>
          )}
          {email && <span className="muted" style={{ wordBreak: "break-all" }}>{email}</span>}
        </div>
        <button className="secondary profile-signout" onClick={onSignOut}>Sign out</button>
      </div>

      {/* Career record — the player card */}
      {stats === undefined ? (
        <div className="player-stats" aria-hidden="true">
          {[0, 1, 2].map((i) => <div key={i} className="player-stat skeleton" />)}
        </div>
      ) : isRookie ? (
        <div className="rookie">
          <span className="badge">ROOKIE</span>
          <p className="muted" style={{ margin: 0 }}>No calls settled yet. Back one and start your record.</p>
          <button onClick={onPlay}>Back your first call →</button>
        </div>
      ) : (
        <section>
          <h3 className="section-title">Your record</h3>
          <div className="player-stats">
            <div className={`player-stat ${netUp ? "net-up" : net < 0n ? "net-down" : ""}`}>
              <span className="label">Net profit</span>
              <span className="stat-big">
                {netUp ? "+" : net < 0n ? "−" : ""}${formatUsdc(net < 0n ? -net : net)}
              </span>
              <span className="stat-foot">across {played} settled {played === 1 ? "pool" : "pools"}</span>
              {/* Profit or loss per settled Pool, around a zero line. */}
              {bars.length > 0 && (
                <div className="net-bars" aria-hidden="true">
                  <span className="zero" />
                  {bars.map((b) => (
                    <span key={b.pool} className={`nb ${b.delta < 0n ? "down" : "up"}`}>
                      <span className="stem" style={{ height: `${8 + b.frac * 22}px` }} />
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="player-stat streak-stat">
              {/* Bets placed, not bets won — a losing streak is still a streak, and the
                  strip below already says which ones hit. Wins live in Record. */}
              <span className="label">Bet streak</span>
              <span className="stat-big">{played}<span className="stat-of"> in a row</span></span>
              <span className="stat-foot">
                {played > 0 ? "keep it alive 🔥" : "back a call to start one"}
              </span>
              {/* Your last 7 calls, oldest first. Always 7 slots — the empty ones are the
                  bets you haven't made yet, which is the nudge. */}
              <ul className="streak-strip" aria-label="Your last 7 calls">
                {Array.from({ length: 7 }, (_, i) => {
                  const r = recent[i];
                  // A placed bet is a placed bet — win or lose, it feeds the streak. The W/L
                  // split lives in Record; this strip only answers "did you show up?".
                  const placed = Boolean(r);
                  return (
                    <li key={r?.pool ?? `slot-${i}`} className={placed ? "hit" : "pending"}>
                      <span className="slot-mark" aria-hidden="true">{placed ? "🔥" : ""}</span>
                      <span className="slot-num">{i + 1}</span>
                      <span className="sr-only">
                        Bet {i + 1}: {placed ? "placed" : "not placed yet"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="player-stat">
              <span className="label">Record</span>
              <span className="stat-big">{stats?.wins ?? 0}<span className="stat-of">/{played}</span></span>
              <span className="stat-foot">
                {played > 0 ? `${Math.round(((stats?.wins ?? 0) / played) * 100)}% hit rate` : "no calls yet"}
              </span>
              {/* Hit rate as a meter — the W/L split you can read without doing the division. */}
              {played > 0 && (
                <div className="hit-meter">
                  <div className="track">
                    <Progress
                      value={((stats?.wins ?? 0) / played) * 100}
                      aria-label={`${stats?.wins ?? 0} wins from ${played} settled pools`}
                    />
                  </div>
                  <span className="wl">
                    <span className="w">{stats?.wins ?? 0}W</span>
                    <span className="l">{played - (stats?.wins ?? 0)}L</span>
                  </span>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* One wallet card: what you can spend, and where it lives. */}
      <section className="wallet-card">
        <h3 className="section-title">Your wallet</h3>
        <div className="pc-cells">
          <div className="pc-cell">
            <span className="label">Ready to bet</span>
            <span className="num">{usdc === null ? "…" : `$${usdc}`}</span>
            <span className="stat-foot">USDC</span>
            {wallet && (
              <>
                <button className="deposit-btn" onClick={deposit}>+ Deposit</button>
              </>
            )}
          </div>
          <div className="pc-cell">
            <span className="label">Network fees</span>
            <span className="num">{sol === null ? "…" : sol.toFixed(3)}</span>
            <span className="stat-foot">SOL — paid automatically</span>
          </div>
          {/* The address is the third column, not a stray row underneath — it fills the
              card the same way the record row above fills its own. */}
          {wallet && (
            <div className="pc-cell wallet-id">
              <span className="label">Your address</span>
              <div className="wallet-row">
              {/* The address IS the copy control — one target instead of a chip plus a
                  button that never lined up with it. Truncated; copy yields the full key. */}
              <button
                className={`addr-btn${copied ? " copied" : ""}`}
                onClick={copyWallet}
                title={wallet}
                aria-label={copied ? "Wallet address copied" : `Copy wallet address ${wallet}`}
              >
                <code>{wallet.slice(0, 6)}…{wallet.slice(-6)}</code>
                <span className="addr-action" aria-hidden="true">{copied ? "✓ Copied" : "Copy"}</span>
              </button>
              <a
                className="explorer-link"
                href={`https://explorer.solana.com/address/${wallet}?cluster=${CLUSTER}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Explorer ↗
              </a>
              </div>
              <span className="stat-foot">Created by your login — no seed phrase to lose.</span>
            </div>
          )}
        </div>

        {fundError && <p className="error" style={{ margin: 0 }}>Deposit unavailable — {fundError}</p>}
      </section>

      {showDeposit && wallet && (
        <DepositModal wallet={wallet} usdc={usdc} onClose={() => setShowDeposit(false)} />
      )}
    </div>
  );
}
