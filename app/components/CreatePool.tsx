"use client";

import { useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useFinalWhistle } from "@/lib/useFinalWhistle";
import { FIXTURES } from "@/lib/fixtures";
import { KICKOFF_OFFSET_SECONDS } from "@/lib/config";

/** Create a Match Winner (1X2) Pool on a chosen upcoming Fixture, in the active Group. */
export function CreatePool({ group, onCreated }: { group: PublicKey; onCreated: () => void }) {
  const { client } = useFinalWhistle();
  const [fixtureId, setFixtureId] = useState(FIXTURES[0].fixtureId.toString());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!client) return;
    setBusy(true);
    setError(null);
    try {
      const fixture = FIXTURES.find((f) => f.fixtureId.toString() === fixtureId)!;
      // nonce lets a Group open more than one Pool per Fixture; pick the next free one in
      // THIS group so a repeat create doesn't collide with an existing Pool's PDA.
      const existing = await client.listPools(group);
      const nonce = BigInt(existing.filter((p) => p.fixtureId === fixture.fixtureId).length);
      // Kickoff a short offset from now so the Pool Opens now and can Lock soon.
      const kickoff = Math.floor(Date.now() / 1000) + KICKOFF_OFFSET_SECONDS;
      await client.createPool(group, fixture.fixtureId, nonce, kickoff);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <h2>Create a Pool</h2>
      <div className="row">
        <select value={fixtureId} onChange={(e) => setFixtureId(e.target.value)} disabled={busy}>
          {FIXTURES.map((f) => (
            <option key={f.fixtureId.toString()} value={f.fixtureId.toString()}>
              {f.home} vs {f.away}
            </option>
          ))}
        </select>
        <button onClick={create} disabled={busy || !client}>
          {busy ? "Creating…" : "Create Match Winner Pool"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
