"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useFinalWhistle } from "@/lib/useFinalWhistle";
import type { PoolAccount } from "@/lib/anchorClient";
import { fixtureById } from "@/lib/fixtures";
import { formatUsdc } from "@/lib/format";

/** List of every Pool, newest activity first — click through to the live Pool view. */
export function PoolList({ refreshKey }: { refreshKey: number }) {
  const { client } = useFinalWhistle();
  const [pools, setPools] = useState<PoolAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!client) return;
    try {
      setPools(await client.listPools());
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (loading) return <div className="panel muted">Loading Pools…</div>;
  if (pools.length === 0) return <div className="panel muted">No Pools yet — create one above.</div>;

  return (
    <div className="stack">
      {pools.map((p) => {
        const f = fixtureById(p.fixtureId);
        return (
          <Link key={p.address.toBase58()} href={`/pool/${p.address.toBase58()}`} className="card-link">
            <div className="panel row between" style={{ marginBottom: 0 }}>
              <div className="stack" style={{ gap: 2 }}>
                <strong>{f ? `${f.home} vs ${f.away}` : `Fixture ${p.fixtureId}`}</strong>
                <span className="muted" style={{ fontSize: 13 }}>Pot ${formatUsdc(p.pot)}</span>
              </div>
              <span className={`badge ${p.state}`}>{p.state}</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
