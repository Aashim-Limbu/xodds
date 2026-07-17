"use client";

import { useEffect, useState } from "react";
import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { RPC_URL, usdcMint } from "@/lib/config";
import { computeStandings, type PoolResult, type Standing } from "@/lib/leaderboard";
import { formatUsdc } from "@/lib/format";
import { supabase } from "@/lib/supabase";

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
  const [sol, setSol] = useState<number | null>(null);
  const [usdc, setUsdc] = useState<string | null>(null);
  const [stats, setStats] = useState<Standing | null | undefined>(undefined); // undefined=loading, null=no record
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
  }, [wallet]);

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

  const played = stats?.plays ?? 0;
  const isRookie = stats !== undefined && played === 0;
  const net = stats?.net ?? 0n;
  const netUp = net > 0n;

  return (
    <div className="panel stack profile-card" style={{ gap: 20 }}>
      {/* Identity + editable name */}
      <div className="profile-head">
        <span className="friend-avatar profile-avatar" aria-hidden="true">
          {displayName.slice(0, 1).toUpperCase()}
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
        <div className="player-stats">
          <div className={`player-stat ${netUp ? "net-up" : net < 0n ? "net-down" : ""}`}>
            <span className="label">Net</span>
            <span className="stat-big">
              {netUp ? "+" : net < 0n ? "−" : ""}${formatUsdc(net < 0n ? -net : net)}
            </span>
          </div>
          <div className="player-stat">
            <span className="label">Win streak</span>
            <span className="stat-big">{(stats?.streak ?? 0) > 0 ? `🔥 ${stats!.streak}` : "0"}</span>
          </div>
          <div className="player-stat">
            <span className="label">Record</span>
            <span className="stat-big">{stats?.wins ?? 0}<span className="stat-of">/{played}</span></span>
          </div>
        </div>
      )}

      {/* Money at a glance */}
      <div className="pc-cells" style={{ maxWidth: 420 }}>
        <div className="pc-cell">
          <span className="label">USDC balance</span>
          <span className="num">{usdc === null ? "…" : `$${usdc}`}</span>
        </div>
        <div className="pc-cell">
          <span className="label">SOL (fees)</span>
          <span className="num">{sol === null ? "…" : sol.toFixed(3)}</span>
        </div>
      </div>

      {wallet && (
        <div>
          <div className="label muted">Wallet</div>
          <div className="row" style={{ flexWrap: "wrap", marginTop: 4 }}>
            <code style={{ wordBreak: "break-all" }}>{wallet}</code>
            <button className="secondary" onClick={copyWallet}>{copied ? "Copied!" : "Copy"}</button>
            <a
              href={`https://explorer.solana.com/address/${wallet}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
            >
              View on Explorer ↗
            </a>
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            Your embedded wallet — created by your login, no seed phrase to lose.
          </p>
        </div>
      )}

      <div className="row">
        <button className="secondary" onClick={onSignOut}>Sign out</button>
      </div>
    </div>
  );
}
