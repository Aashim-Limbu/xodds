"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PublicKey } from "@solana/web3.js";
import { useFinalWhistle } from "@/lib/useFinalWhistle";
import type { PoolAccount } from "@/lib/anchorClient";
import { groupByFixture, type Match } from "@/lib/markets";
import { MatchCard } from "./MatchCard";

type Filter = "all" | "open" | "settled";

/** The active Group's Pools as dashboard cards, with ALL / OPEN / SETTLED filters. */
export function PoolList({ group, refreshKey }: { group: PublicKey; refreshKey: number }) {
  const { client } = useFinalWhistle();
  const [pools, setPools] = useState<PoolAccount[]>([]);
  const [loading, setLoading] = useState(true);
  // Open Pools are the only ones you can still act on — landing on ALL buries them under
  // every void and settled Pool the Group has ever had.
  const [filter, setFilter] = useState<Filter>("open");
  const groupKey = group.toBase58();

  const load = useCallback(async () => {
    if (!client) return;
    try {
      setPools(await client.listPoolsCached(group));
    } finally {
      setLoading(false);
    }
  }, [client, groupKey]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load, refreshKey]);

  const router = useRouter();
  const matches = groupByFixture(pools);
  const shown = matches.filter((m) =>
    filter === "all" ? true : filter === "open" ? m.state === "open" : m.state === "settled",
  );

  function openMatch(m: Match) {
    router.push(`/match/${m.group.toBase58()}/${m.fixtureId.toString()}`);
  }

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
          {/* The default filter hides Pools, so the way back has to be right here — otherwise
              a Group with only settled Pools looks empty. */}
          {filter !== "all" && (
            <>
              {" "}
              <button className="link-btn" onClick={() => setFilter("all")}>
                Show all {matches.length}
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="pool-grid">
          {shown.map((m) => (
            <MatchCard key={m.fixtureId.toString()} match={m} onOpen={openMatch} />
          ))}
        </div>
      )}
    </>
  );
}
