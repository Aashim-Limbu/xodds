"use client";

import { useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { type SettlementReceipt, toHex } from "@/lib/anchorClient";
import { useFinalWhistle } from "@/lib/useFinalWhistle";
import { fixtureById, outcomeLabels } from "@/lib/fixtures";

function short(hex: string): string {
  return hex.length <= 20 ? hex : `${hex.slice(0, 10)}…${hex.slice(-10)}`;
}

/**
 * The Proof Receipt — the hero artifact. Renders the winning Outcome, TxLINE's proven
 * stats, the score root it verified against, the Merkle path, and the settlement tx.
 * All of it is derived from the on-chain settlement, so any Member — winner or loser —
 * can check that the result was proven, not chosen.
 */
export function ProofReceipt({ address, fixtureId }: { address: string; fixtureId: bigint }) {
  const { client } = useFinalWhistle();
  const [receipt, setReceipt] = useState<SettlementReceipt | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!client) return;
    let live = true;
    client
      .fetchSettlement(new PublicKey(address))
      .then((r) => live && setReceipt(r))
      .catch(() => live && setReceipt(null))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [client, address]);

  if (loading) return <div className="panel muted">Building Proof Receipt…</div>;
  if (!receipt) return <div className="panel muted">No settlement proof found for this Pool.</div>;

  const fixture = fixtureById(fixtureId);
  const labels = fixture ? outcomeLabels(fixture) : ["Home win", "Draw", "Away win"];
  const p = receipt.proven;
  const explorer = `https://explorer.solana.com/tx/${receipt.signature}?cluster=devnet`;

  return (
    <div className="panel receipt">
      <div className="row between">
        <h2 style={{ margin: 0 }}>Proof Receipt</h2>
        <span className="badge settled">Proven</span>
      </div>
      <p className="muted" style={{ marginTop: 6 }}>
        Nobody, including us, chose this outcome. It was proven on-chain from TxLINE&rsquo;s Score
        Proof — verify every value below yourself.
      </p>

      <div className="receipt-grid">
        <div>
          <div className="muted receipt-label">Winning Outcome</div>
          <div className="receipt-strong">{labels[receipt.winningOutcome]}</div>
        </div>
        <div>
          <div className="muted receipt-label">Proven score</div>
          <div className="receipt-strong">
            {p.homeGoals}&ndash;{p.awayGoals}
          </div>
        </div>
        <div>
          <div className="muted receipt-label">Corners (H/A)</div>
          <div>{p.homeCorners} / {p.awayCorners}</div>
        </div>
        <div>
          <div className="muted receipt-label">Cards (H/A)</div>
          <div>{p.homeCards} / {p.awayCards}</div>
        </div>
      </div>

      <div className="stack" style={{ marginTop: 14, gap: 10 }}>
        <div>
          <div className="muted receipt-label">TxLINE score root (verified against)</div>
          <code className="mono">{toHex(receipt.scoreRoot)}</code>
        </div>
        <div>
          <div className="muted receipt-label">Merkle path ({receipt.merklePath.length} node{receipt.merklePath.length === 1 ? "" : "s"})</div>
          <div className="stack" style={{ gap: 2 }}>
            {receipt.merklePath.length === 0 ? (
              <span className="muted">— (the Fixture leaf is the root)</span>
            ) : (
              receipt.merklePath.map((node, i) => (
                <code className="mono" key={i}>{short(toHex(node))}</code>
              ))
            )}
          </div>
        </div>
        <div>
          <div className="muted receipt-label">Settlement transaction</div>
          <a className="mono" href={explorer} target="_blank" rel="noreferrer">
            {short(receipt.signature)} ↗
          </a>
        </div>
      </div>
    </div>
  );
}
