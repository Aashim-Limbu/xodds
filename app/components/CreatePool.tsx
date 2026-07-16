"use client";

import { useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useFinalWhistle } from "@/lib/useFinalWhistle";
import { friendlyError } from "@/lib/errors";
import { useFixtures } from "@/lib/useTxlineLive";
import { KICKOFF_OFFSET_SECONDS } from "@/lib/config";
import type { PoolTypeName } from "@/lib/anchorClient";

// Over/Under Lines offered per Pool Type, stored as line × 2 (odd = half-integer, no push).
const LINES: Record<string, number[]> = {
  totalGoals: [3, 5, 7], // 1.5 / 2.5 / 3.5
  totalCorners: [17, 19, 21], // 8.5 / 9.5 / 10.5
  totalCards: [7, 9, 11], // 3.5 / 4.5 / 5.5
};

/** Create a Pool (Match Winner or Total Goals O/U) on a Fixture, in the active Group. */
export function CreatePool({ group, onCreated }: { group: PublicKey; onCreated: () => void }) {
  const { client } = useFinalWhistle();
  const fixtures = useFixtures(); // static slate + real TxLINE Fixtures when a token is configured
  const [fixtureId, setFixtureId] = useState(fixtures[0].fixtureId.toString());
  const [poolType, setPoolType] = useState<PoolTypeName>("matchWinner");
  const [lineX2, setLineX2] = useState(5);
  const hasLine = poolType !== "matchWinner";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!client) return;
    setBusy(true);
    setError(null);
    try {
      const fixture = fixtures.find((f) => f.fixtureId.toString() === fixtureId)!;
      // First free nonce for this Group + Fixture + Pool Type (the PDA is keyed by all three).
      const nonce = await client.freeNonce(group, fixture.fixtureId, poolType);
      const kickoff = Math.floor(Date.now() / 1000) + KICKOFF_OFFSET_SECONDS;
      await client.createPool(group, fixture.fixtureId, nonce, kickoff, poolType, hasLine ? lineX2 : 0);
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
        <select
          value={poolType}
          onChange={(e) => {
            const t = e.target.value as PoolTypeName;
            setPoolType(t);
            if (t !== "matchWinner") setLineX2(LINES[t][1]); // sensible middle Line per type
          }}
          disabled={busy}
        >
          <option value="matchWinner">Match Winner (1X2)</option>
          <option value="totalGoals">Total Goals O/U</option>
          <option value="totalCorners">Total Corners O/U</option>
          <option value="totalCards">Total Cards O/U</option>
        </select>
        {hasLine && (
          <select value={lineX2} onChange={(e) => setLineX2(Number(e.target.value))} disabled={busy}>
            {LINES[poolType].map((l) => (
              <option key={l} value={l}>
                Line {l / 2}
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
