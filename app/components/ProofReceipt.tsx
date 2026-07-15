"use client";

import { useEffect, useMemo, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { type PoolTypeName, readOnlyClient, type SettlementReceipt, toHex } from "@/lib/anchorClient";
import { verifyScoreProof } from "@/lib/proof";
import { scoresRootPda } from "@/lib/pdas";
import { useFinalWhistle } from "@/lib/useFinalWhistle";
import { fixtureById, poolOutcomeLabels } from "@/lib/fixtures";

function short(hex: string): string {
  return hex.length <= 20 ? hex : `${hex.slice(0, 10)}…${hex.slice(-10)}`;
}

/**
 * The Proof Receipt — the hero artifact. Renders the winning Outcome, TxLINE's proven
 * stats, the score root it verified against, the Merkle path, and the settlement tx.
 * All of it is derived from the on-chain settlement, so any Member — winner or loser —
 * can check that the result was proven, not chosen.
 */
export function ProofReceipt({
  address,
  fixtureId,
  poolType,
  lineX2,
}: {
  address: string;
  fixtureId: bigint;
  poolType: PoolTypeName;
  lineX2: number;
}) {
  const { client: authed } = useFinalWhistle();
  // Settlement is public: fall back to a wallet-less client so the receipt renders on the
  // public share page (and to any signed-out viewer) exactly as it does in-app.
  const client = useMemo(() => authed ?? readOnlyClient(), [authed]);
  const [receipt, setReceipt] = useState<SettlementReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [shared, setShared] = useState(false);

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

  // Re-derive the score root from the receipt's own values, right here in the browser. If it
  // reproduces the root TxLINE published, these exact stats are what settle() proved against.
  const check = useMemo(
    () => (receipt ? verifyScoreProof(fixtureId, receipt.proven, receipt.merklePath, receipt.scoreRoot) : null),
    [receipt, fixtureId],
  );

  if (loading) return <div className="panel muted">Building Proof Receipt…</div>;
  if (!receipt) return <div className="panel muted">No settlement proof found for this Pool.</div>;

  const fixture = fixtureById(fixtureId);
  const labels = poolOutcomeLabels(poolType, lineX2, fixture);
  const p = receipt.proven;
  const explorer = `https://explorer.solana.com/tx/${receipt.signature}?cluster=devnet`;

  async function share() {
    const url = `${window.location.origin}/receipt/${address}`;
    const text = `Proven on-chain: ${labels[receipt!.winningOutcome]} — nobody, including us, chose it.`;
    // Native share sheet on mobile; clipboard everywhere else.
    if (navigator.share) {
      try {
        await navigator.share({ title: "xOdds Proof Receipt", text, url });
        return;
      } catch {
        /* user cancelled — fall through to copy */
      }
    }
    await navigator.clipboard.writeText(url);
    setShared(true);
    setTimeout(() => setShared(false), 1600);
  }

  return (
    <div className="receipt-split">
      <div className="proven-panel">
        <span className="sticker" aria-hidden="true">🏆</span>
        <span className="proven-word">Proven</span>
      </div>

      <div className="receipt-body">
        <h2 style={{ margin: 0 }}>Proof Receipt</h2>
        {fixture && (
          <div className="score-line">
            <span className="receipt-label">Final score</span>
            <span>{fixture.home}</span>
            <span className="score-chip">{p.homeGoals}&ndash;{p.awayGoals}</span>
            <span>{fixture.away}</span>
          </div>
        )}
        <div className="row" style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div className="receipt-strong" style={{ textTransform: "uppercase" }}>
            {labels[receipt.winningOutcome]} wins
          </div>
          <button className="share-btn" onClick={share}>
            <span className="msym">ios_share</span>
            {shared ? "Link copied ✓" : "Share receipt"}
          </button>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Nobody, including us, chose this outcome. It was proven on-chain from TxLINE&rsquo;s Score
          Proof — and re-checked right here in your browser.
        </p>

        {check && (
          <div className={`verify ${check.ok ? "verify-ok" : "verify-fail"}`} role="status">
            <span className="verify-mark" aria-hidden="true">{check.ok ? "✓" : "✕"}</span>
            <div>
              <div className="verify-title">
                {check.ok ? "Verified in your browser" : "Verification failed"}
              </div>
              <div className="verify-sub">
                {check.ok
                  ? "The values below were hashed on your device and reproduce TxLINE’s published root exactly — no trust in us required."
                  : "These values do not reproduce the published root. Do not trust this receipt."}
              </div>
            </div>
          </div>
        )}

        <div className="receipt-grid">
          <div>
            <div className="receipt-label">Proven score</div>
            <div className="receipt-strong">{p.homeGoals}&ndash;{p.awayGoals}</div>
          </div>
          <div>
            <div className="receipt-label">Winning Outcome</div>
            <div className="receipt-strong">{labels[receipt.winningOutcome]}</div>
          </div>
          <div>
            <div className="receipt-label">Corners (H/A)</div>
            <div>{p.homeCorners} / {p.awayCorners}</div>
          </div>
          <div>
            <div className="receipt-label">Cards (H/A)</div>
            <div>{p.homeCards} / {p.awayCards}</div>
          </div>
        </div>

        <div className="stack" style={{ gap: 10 }}>
          <div className="receipt-label" style={{ marginBottom: -6 }}>⛓ On-chain verification</div>
          <div>
            <div className="receipt-label">TxLINE score root (verified against)</div>
            <code className="mono receipt-bar">{toHex(receipt.scoreRoot)}</code>
            <a
              className="mono receipt-bar"
              style={{ display: "block", marginTop: 6 }}
              href={`https://explorer.solana.com/address/${scoresRootPda(fixtureId).toBase58()}?cluster=devnet`}
              target="_blank"
              rel="noreferrer"
            >
              Published in a TxLINE-owned account ↗
            </a>
            {check && !check.ok && (
              <>
                <div className="receipt-label" style={{ marginTop: 6 }}>Root recomputed here (does not match)</div>
                <code className="mono receipt-bar" style={{ color: "var(--danger)" }}>{toHex(check.computedRoot)}</code>
              </>
            )}
          </div>
          <div>
            <div className="receipt-label">Merkle path ({receipt.merklePath.length} node{receipt.merklePath.length === 1 ? "" : "s"})</div>
            {receipt.merklePath.length === 0 ? (
              <span className="muted" style={{ fontSize: 13 }}>— (the Fixture leaf is the root)</span>
            ) : (
              receipt.merklePath.map((node, i) => (
                <code className="mono receipt-bar" key={i}>{short(toHex(node))}</code>
              ))
            )}
          </div>
          <div>
            <div className="receipt-label">Settlement transaction</div>
            <a className="mono receipt-bar" href={explorer} target="_blank" rel="noreferrer">
              {short(receipt.signature)} ↗
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
