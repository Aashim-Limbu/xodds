// Group leaderboard: pure aggregation over per-user settled-Pool results. Kept isomorphic
// and unit-tested (tests/leaderboard.test.ts). The results themselves are recorded to
// Supabase as Pools settle (see useLeaderboard / feed rented realtime, ADR-0006) because a
// winning Entry is closed on claim — standings can't be rebuilt from surviving on-chain Entries.

/** One user's outcome in one settled Pool. */
export interface PoolResult {
  pool: string; // Pool address — (pool, wallet) is the dedupe key
  wallet: string; // the User's wallet address (stable identity)
  name: string; // display name at time of recording
  staked: bigint; // total this User staked in the Pool (base units)
  won: bigint; // total this User received (0 if they lost)
  ts: number; // settlement time
}

/** A User's aggregated standing in the Group. */
export interface Standing {
  wallet: string;
  name: string;
  plays: number;
  wins: number; // net-positive results
  staked: bigint;
  won: bigint;
  net: bigint; // won − staked
  streak: number; // current consecutive wins, most-recent first
}

const isWin = (r: Pick<PoolResult, "won" | "staked">) => r.won > r.staked;

/** Current consecutive wins counting back from the most recent result. */
export function winStreak(results: PoolResult[]): number {
  const chrono = [...results].sort((a, b) => a.ts - b.ts);
  let streak = 0;
  for (let i = chrono.length - 1; i >= 0; i--) {
    if (isWin(chrono[i])) streak++;
    else break;
  }
  return streak;
}

/** Aggregate results into ranked Standings: net ↓, then wins ↓, then fewer plays ↑. */
export function computeStandings(results: PoolResult[]): Standing[] {
  // Dedupe by (pool, wallet) — a result may be reported more than once.
  const unique = new Map<string, PoolResult>();
  for (const r of results) unique.set(`${r.pool}:${r.wallet}`, r);

  const byWallet = new Map<string, PoolResult[]>();
  for (const r of unique.values()) {
    const list = byWallet.get(r.wallet) ?? [];
    list.push(r);
    byWallet.set(r.wallet, list);
  }

  const standings: Standing[] = [];
  for (const [wallet, rows] of byWallet) {
    const latest = [...rows].sort((a, b) => b.ts - a.ts)[0];
    let staked = 0n;
    let won = 0n;
    let wins = 0;
    for (const r of rows) {
      staked += r.staked;
      won += r.won;
      if (isWin(r)) wins++;
    }
    standings.push({
      wallet,
      name: latest.name,
      plays: rows.length,
      wins,
      staked,
      won,
      net: won - staked,
      streak: winStreak(rows),
    });
  }

  return standings.sort(
    (a, b) =>
      cmp(b.net, a.net) || // higher net first
      b.wins - a.wins || // then more wins
      a.plays - b.plays, // then fewer plays (better win rate)
  );
}

function cmp(a: bigint, b: bigint): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
