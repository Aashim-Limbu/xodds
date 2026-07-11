"use client";

import { useState } from "react";
import { useFinalWhistle } from "@/lib/useFinalWhistle";
import { FIXTURES } from "@/lib/fixtures";

/** Create a Match Winner (1X2) Pool on a chosen upcoming Fixture. */
export function CreatePool({ onCreated }: { onCreated: () => void }) {
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
      // nonce lets a Group open more than one Pool per Fixture; pick the next free one
      // so a repeat create doesn't collide with an existing Pool's PDA.
      const existing = await client.listPools();
      const nonce = BigInt(existing.filter((p) => p.fixtureId === fixture.fixtureId).length);
      await client.createPool(fixture.fixtureId, nonce, fixture.kickoff);
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
