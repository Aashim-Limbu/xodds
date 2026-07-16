"use client";

import { useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { friendlyError } from "@/lib/errors";
import { KICKOFF_OFFSET_SECONDS } from "@/lib/config";
import { type Fixture } from "@/lib/fixtures";
import { useTxlineLive } from "@/lib/useTxlineLive";
import { useFinalWhistle } from "@/lib/useFinalWhistle";
import type { PoolTypeName } from "@/lib/anchorClient";
import { Modal } from "./Modal";

// Default Over/Under Lines per Pool Type, as line × 2 (odd = half-integer, no push).
const LINES: Record<string, number[]> = {
  totalGoals: [3, 5, 7], // 1.5 / 2.5 / 3.5
  totalCorners: [17, 19, 21], // 8.5 / 9.5 / 10.5
  totalCards: [7, 9, 11], // 3.5 / 4.5 / 5.5
};

const TYPES: Array<{ id: PoolTypeName; label: string; blurb: string }> = [
  { id: "matchWinner", label: "Match Winner (1X2)", blurb: "Home / Draw / Away" },
  { id: "totalGoals", label: "Total Goals O/U", blurb: "Over or under the line" },
  { id: "totalCorners", label: "Total Corners O/U", blurb: "Both teams' corners" },
  { id: "totalCards", label: "Total Cards O/U", blurb: "Yellows + reds, both teams" },
];

/** Create a Pool on a Fixture: pick the market, pick the line, one tap. Live TxLINE odds
 * enrich the picker where they exist (1X2 crowd odds, suggested goals lines); everywhere
 * else the honest story is the settlement proof, not odds. */
export function CreatePoolModal({
  open,
  onClose,
  fixture,
  group,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  fixture: Fixture | null;
  group: PublicKey;
  onCreated: () => void;
}) {
  const { client } = useFinalWhistle();
  const live = useTxlineLive(open && fixture ? fixture.fixtureId : 0n);
  const [poolType, setPoolType] = useState<PoolTypeName>("matchWinner");
  const [lineX2, setLineX2] = useState(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!fixture) return null;
  const hasLine = poolType !== "matchWinner";
  // Feed-suggested goals lines (already filtered to half-integers) win over the defaults.
  const lines = poolType === "totalGoals" && live.goalLines?.length ? live.goalLines : LINES[poolType] ?? [];
  const probs = live.referenceProbabilities ?? fixture.referenceProbabilities;
  const hasOdds = poolType === "matchWinner" && probs.some((p) => p > 0);

  function pick(t: PoolTypeName) {
    setPoolType(t);
    if (t !== "matchWinner") {
      const ls = t === "totalGoals" && live.goalLines?.length ? live.goalLines : LINES[t];
      setLineX2(ls[Math.floor(ls.length / 2)]);
    }
  }

  async function create() {
    if (!client) return;
    setBusy(true);
    setError(null);
    try {
      const nonce = await client.freeNonce(group, fixture!.fixtureId, poolType);
      const kickoff = Math.floor(Date.now() / 1000) + KICKOFF_OFFSET_SECONDS;
      await client.createPool(group, fixture!.fixtureId, nonce, kickoff, poolType, hasLine ? lineX2 : 0);
      onCreated();
      onClose();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`${fixture.home} vs ${fixture.away}`} icon="sports_soccer"
      sub={`Pick the market for your Group's Pool. FX-${fixture.fixtureId}`}>
      <div className="stack" style={{ gap: 14 }}>
        <div className="field">
          <label className="field-label">Market</label>
          <div className="ptype-grid" role="radiogroup" aria-label="Pool type">
            {TYPES.map((t) => (
              <button
                key={t.id}
                role="radio"
                aria-checked={poolType === t.id}
                className={`ptype-btn${poolType === t.id ? " active" : ""}`}
                onClick={() => pick(t.id)}
                disabled={busy}
              >
                <strong>{t.label}</strong>
                <span className="muted">{t.blurb}</span>
              </button>
            ))}
          </div>
        </div>

        {hasLine && (
          <div className="field">
            <label className="field-label">Line</label>
            <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
              {lines.map((l) => (
                <button
                  key={l}
                  className={`gchip${lineX2 === l ? " active" : ""}`}
                  aria-pressed={lineX2 === l}
                  onClick={() => setLineX2(l)}
                  disabled={busy}
                >
                  {l / 2}
                </button>
              ))}
            </div>
          </div>
        )}

        {hasOdds ? (
          <div className="field">
            <label className="field-label">Crowd odds (display only — payouts are the shared pot)</label>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <span className="badge">{fixture.home} {(probs[0] * 100).toFixed(0)}%</span>
              <span className="badge">Draw {(probs[1] * 100).toFixed(0)}%</span>
              <span className="badge">{fixture.away} {(probs[2] * 100).toFixed(0)}%</span>
            </div>
          </div>
        ) : (
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            <span className="msym" style={{ fontSize: 15, verticalAlign: "-3px" }}>verified</span>{" "}
            No live odds for this market — it settles from proven match stats (the TxLINE Score Proof).
          </p>
        )}

        {error && <span className="form-error" role="alert">{error}</span>}
        <button onClick={create} disabled={busy || !client}>
          {busy ? "Creating…" : "Create Pool"}
        </button>
      </div>
    </Modal>
  );
}
