"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PublicKey } from "@solana/web3.js";
import { useFinalWhistle } from "@/lib/useFinalWhistle";
import type { PoolAccount, PoolState } from "@/lib/anchorClient";
import { fixtureById, poolTypeLabel } from "@/lib/fixtures";
import { formatUsdc } from "@/lib/format";
import { Avatars, fakeParticipants } from "./Avatars";

const CHIP_LABEL: Record<PoolState, string> = {
  open: "OPEN",
  locked: "LOCKED",
  settled: "SETTLED",
  void: "VOID",
};

// A Material Symbol per fixture, keyed off fixtureId so it's stable. Decorative.
const ICONS = ["sports_soccer", "sports_motorsports", "sports_basketball", "emoji_events"];

function maxBig(xs: bigint[]): bigint {
  return xs.reduce((m, x) => (x > m ? x : m), 0n);
}

type Filter = "all" | "open" | "settled";

/** The active Group's Pools as dashboard cards, with ALL / OPEN / SETTLED filters. */
export function PoolList({ group, refreshKey }: { group: PublicKey; refreshKey: number }) {
  const { client } = useFinalWhistle();
  const [pools, setPools] = useState<PoolAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const groupKey = group.toBase58();

  const load = useCallback(async () => {
    if (!client) return;
    try {
      setPools(await client.listPools(group));
    } finally {
      setLoading(false);
    }
  }, [client, groupKey]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load, refreshKey]);

  const shown = pools.filter((p) =>
    filter === "all" ? true : filter === "open" ? p.state === "open" : p.state === "settled",
  );

  return (
    <>
      <div className="section-head">
        <h2 className="section-title">Active Pools</h2>
        <div className="filter-seg" role="group" aria-label="Filter Pools">
          {(["all", "open", "settled"] as Filter[]).map((f) => (
            <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="panel muted">Loading Pools…</div>
      ) : pools.length === 0 ? (
        <div className="panel" style={{ textAlign: "center", padding: 32 }}>
          <span className="sticker" aria-hidden="true">⚽</span>
          <p style={{ fontWeight: 700, margin: "10px 0 2px" }}>No Pools in this Group yet.</p>
          <p className="muted" style={{ margin: 0 }}>Create one above and kick things off.</p>
        </div>
      ) : shown.length === 0 ? (
        <div className="panel muted" style={{ textAlign: "center" }}>
          No {filter} Pools right now.
        </div>
      ) : (
        <div className="pool-grid">
          {shown.map((p) => {
            const f = fixtureById(p.fixtureId);
            const seed = p.address.toBase58();
            const parts = fakeParticipants(seed, p.pot);
            const open = p.state === "open";
            return (
              <Link key={seed} href={`/pool/${seed}`} className="card-link">
                <div className={`panel pool-card is-${p.state}`}>
                  <div className="pc-body">
                    <div className="pc-head">
                      <div className="row" style={{ gap: 12, minWidth: 0 }}>
                        <span className={`pc-icon sport-${Number(p.fixtureId % 4n)}`} aria-hidden="true">
                          <span className="msym">{ICONS[Number(p.fixtureId % 4n)]}</span>
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div className="pc-title">
                            {f ? `${f.home} vs ${f.away}` : `Fixture ${p.fixtureId}`}
                          </div>
                          <div className="pc-sub">{poolTypeLabel(p.poolType, p.lineX2)}</div>
                        </div>
                      </div>
                      <span className={`pc-chip is-${p.state}`}>{CHIP_LABEL[p.state]}</span>
                    </div>

                    <div className="pc-cells">
                      <div className="pc-cell">
                        <span className="label">Total pot</span>
                        <span className="num">${formatUsdc(p.pot)}</span>
                      </div>
                      <div className="pc-cell">
                        <span className="label">Top side</span>
                        <span className="num">${formatUsdc(maxBig(p.outcomeTotals))}</span>
                      </div>
                    </div>

                    <div className="pc-parts">
                      <span className="label">Participants</span>
                      <Avatars seed={seed} count={parts} />
                    </div>
                  </div>

                  <span className={`pc-action ${open ? "join" : "view"}`}>
                    {open ? "Join pool" : "View pool"}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
