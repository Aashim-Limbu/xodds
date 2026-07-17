"use client";

import { useCallback, useEffect, useState } from "react";
import { computeStandings, type PoolResult, type Standing } from "./leaderboard";
import { supabase } from "./supabase";

// Durable per-Group standings in a `pool_results` table (SQL in DEMO.md). Each client records
// its OWN result once per settled Pool; the leaderboard aggregates the rows. Written durably
// because a winning Entry is closed on claim (ADR-0004), so on-chain Entries can't rebuild it.

interface ResultRow {
  pool: string;
  channel: string;
  wallet: string;
  name: string;
  staked: string; // numeric-as-text from Postgres
  won: string;
  ts: number;
}

const toResult = (r: ResultRow): PoolResult => ({
  pool: r.pool,
  wallet: r.wallet,
  name: r.name,
  staked: BigInt(r.staked),
  won: BigInt(r.won),
  ts: r.ts,
});

/**
 * Record one user's result in a settled Pool. Idempotent per (pool, wallet) — write-once, so
 * re-viewing a settled Pool doesn't double-count. Returns the resulting current win streak
 * (for the streak sticker), or null when unrecorded (no Supabase / already recorded).
 */
export async function recordResult(channel: string, result: PoolResult, token: string): Promise<number | null> {
  if (!supabase) return null;
  // Server-verified write: the route binds the row to the caller's wallet (Codex P1 —
  // anon inserts let anyone forge standings). Reads below stay on the public anon key.
  const res = await fetch("/api/results", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      pool: result.pool,
      channel,
      name: result.name,
      staked: result.staked.toString(),
      won: result.won.toString(),
      ts: result.ts,
    }),
  }).catch(() => null);
  // Duplicate (already recorded), signed out, or unconfigured server -> no sticker.
  if (!res?.ok || !((await res.json()) as { recorded?: boolean }).recorded) return null;

  const { data } = await supabase
    .from("pool_results")
    .select("pool, channel, wallet, name, staked, won, ts")
    .eq("channel", channel)
    .eq("wallet", result.wallet);
  if (!data) return null;
  const mine = computeStandings((data as ResultRow[]).map(toResult)).find((s) => s.wallet === result.wallet);
  return mine?.streak ?? 0;
}

/** Live Group standings for a `group:<id>` channel; [] until loaded or when unconfigured. */
export function useLeaderboard(channel: string): { standings: Standing[]; refresh: () => void } {
  const [standings, setStandings] = useState<Standing[]>([]);

  const load = useCallback(() => {
    if (!supabase || !channel) return;
    supabase
      .from("pool_results")
      .select("pool, channel, wallet, name, staked, won, ts")
      .eq("channel", channel)
      .then(({ data, error }) => {
        if (!error && data) setStandings(computeStandings((data as ResultRow[]).map(toResult)));
      });
  }, [channel]);

  useEffect(() => {
    setStandings([]);
    load();
    const sb = supabase;
    if (!sb || !channel) return;
    // Live: any new result on this Group's channel refreshes the board.
    const ch = sb
      .channel(`lb:${channel}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "pool_results", filter: `channel=eq.${channel}` }, load)
      .subscribe();
    return () => {
      sb.removeChannel(ch);
    };
  }, [channel, load]);

  return { standings, refresh: load };
}
