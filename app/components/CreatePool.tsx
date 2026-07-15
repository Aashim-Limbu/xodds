"use client";

import { useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useFinalWhistle } from "@/lib/useFinalWhistle";
import { friendlyError } from "@/lib/errors";
import { useFixtures } from "@/lib/useTxlineLive";
import { KICKOFF_OFFSET_SECONDS } from "@/lib/config";
import type { PoolTypeName } from "@/lib/anchorClient";

// Over/Under Lines offered, stored as line × 2 (odd = half-integer, so no push).
const LINES: Array<{ label: string; lineX2: number }> = [
  { label: "1.5", lineX2: 3 },
  { label: "2.5", lineX2: 5 },
  { label: "3.5", lineX2: 7 },
];

/** Create a Pool (Match Winner or Total Goals O/U) on a Fixture, in the active Group. */
export function CreatePool({ group, onCreated }: { group: PublicKey; onCreated: () => void }) {
  const { client } = useFinalWhistle();
  const fixtures = useFixtures(); // static slate + real TxLINE Fixtures when a token is configured
  const [fixtureId, setFixtureId] = useState(fixtures[0].fixtureId.toString());
  const [poolType, setPoolType] = useState<PoolTypeName>("matchWinner");
  const [lineX2, setLineX2] = useState(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!client) return;
    setBusy(true);
    setError(null);
    try {
      const fixture = fixtures.find((f) => f.fixtureId.toString() === fixtureId)!;
      // Next free nonce for this Group + Fixture + Pool Type (the PDA is keyed by all three).
      const existing = await client.listPools(group);
      const nonce = BigInt(
        existing.filter((p) => p.fixtureId === fixture.fixtureId && p.poolType === poolType).length,
      );
      const kickoff = Math.floor(Date.now() / 1000) + KICKOFF_OFFSET_SECONDS;
      await client.createPool(group, fixture.fixtureId, nonce, kickoff, poolType, poolType === "totalGoals" ? lineX2 : 0);
      onCreated();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel stack" style={{ gap: 12 }}>
      <h2 style={{ margin: 0 }}>Create a Pool</h2>
      <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
        <select value={fixtureId} onChange={(e) => setFixtureId(e.target.value)} disabled={busy}>
          {fixtures.map((f) => (
            <option key={f.fixtureId.toString()} value={f.fixtureId.toString()}>
              {f.home} vs {f.away}
            </option>
          ))}
        </select>
        <select value={poolType} onChange={(e) => setPoolType(e.target.value as PoolTypeName)} disabled={busy}>
          <option value="matchWinner">Match Winner (1X2)</option>
          <option value="totalGoals">Total Goals O/U</option>
        </select>
        {poolType === "totalGoals" && (
          <select value={lineX2} onChange={(e) => setLineX2(Number(e.target.value))} disabled={busy}>
            {LINES.map((l) => (
              <option key={l.lineX2} value={l.lineX2}>
                Line {l.label}
              </option>
            ))}
          </select>
        )}
        <button onClick={create} disabled={busy || !client}>
          {busy ? "Creating…" : "Create Pool"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
