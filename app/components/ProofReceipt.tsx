"use client";

import { useEffect, useMemo, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { type PoolTypeName, readOnlyClient, type SettlementReceipt, toHex } from "@/lib/anchorClient";
import { verifyScoreProof } from "@/lib/proof";
import { scoresRootPda } from "@/lib/pdas";
import { useFinalWhistle } from "@/lib/useFinalWhistle";
import { fixtureById, poolOutcomeLabels } from "@/lib/fixtures";
import { useFixtures } from "@/lib/useTxlineLive";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Alert } from "@/components/ui/alert";

function short(hex: string): string {
  return hex.length <= 20 ? hex : `${hex.slice(0, 10)}…${hex.slice(-10)}`;
}

/**
 * The Proof Receipt — the hero artifact. A fan reads down to "Verified in your browser"
 * and stops; the score root, Merkle path, and settlement tx live behind "Check it
 * yourself" so the chain never lands on someone who didn't ask for it (PRODUCT.md:
 * crypto is invisible). A FAILED proof is never hidden — it renders open.
 *
 * The class hooks `proven-panel`, `sticker`, `receipt-body`, and `verify` carry the
 * settlement reveal in globals.css (the legacy layer). Renaming them silently kills the
 * app's signature moment — no error, no test failure. Leave them alone.
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
  useFixtures(); // hydrate real TxLINE fixtures on direct /receipt/<id> loads
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

  // The skeleton renders in a SIBLING branch, not the same subtree position as the
  // resolved receipt. @starting-style only fires on freshly inserted nodes — reusing the
  // position would stop the reveal from triggering.
  if (loading) {
    return (
      <Card className="gap-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-16 w-full" />
        <span className="sr-only">Building Proof Receipt…</span>
      </Card>
    );
  }
  if (!receipt) {
    return <Card className="text-muted-foreground">No settlement proof found for this Pool.</Card>;
  }

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
    <Card className="receipt-split gap-0 overflow-hidden p-0">
      <div className="proven-panel flex items-center gap-3 border-b-[3px] border-border bg-primary px-5 py-3">
        <span className="sticker text-2xl" aria-hidden="true">🏆</span>
        <span className="proven-word font-display text-lg font-extrabold uppercase tracking-[0.06em]">
          Proven
        </span>
      </div>

      <div className="receipt-body flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="m-0 font-display text-xl font-extrabold uppercase">Proof Receipt</h2>
            {fixture && (
              <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                <span>{fixture.home}</span>
                <Badge variant="outline" className="text-[13px]">
                  {p.homeGoals}&ndash;{p.awayGoals}
                </Badge>
                <span>{fixture.away}</span>
              </div>
            )}
          </div>
          <Button variant="secondary" size="sm" onClick={share}>
            {shared ? "Link copied ✓" : "Share receipt"}
          </Button>
        </div>

        <div className="font-display text-2xl font-extrabold uppercase">
          {labels[receipt.winningOutcome]} wins
        </div>

        <p className="m-0 text-[13px] text-muted-foreground">
          Nobody, including us, chose this outcome. It was proven on-chain from TxLINE&rsquo;s Score
          Proof — and re-checked right here in your browser.
        </p>

        {check && (
          <Alert
            variant={check.ok ? "success" : "destructive"}
            className={`verify ${check.ok ? "verify-ok" : "verify-fail"} flex items-start gap-3`}
            role="status"
          >
            <span className="verify-mark text-xl leading-none" aria-hidden="true">
              {check.ok ? "✓" : "✕"}
            </span>
            <div>
              <div className="verify-title text-sm font-extrabold uppercase">
                {check.ok ? "Verified in your browser" : "Verification failed"}
              </div>
              <div className="verify-sub mt-0.5 text-xs text-muted-foreground">
                {check.ok
                  ? "The values below were hashed on your device and reproduce TxLINE’s published root exactly — no trust in us required."
                  : "These values do not reproduce the published root. Do not trust this receipt."}
              </div>
            </div>
          </Alert>
        )}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Proven score" value={`${p.homeGoals}–${p.awayGoals}`} strong />
          <Stat label="Winning Outcome" value={labels[receipt.winningOutcome]} strong />
          <Stat label="Corners (H/A)" value={`${p.homeCorners} / ${p.awayCorners}`} />
          <Stat label="Cards (H/A)" value={`${p.homeCards} / ${p.awayCards}`} />
        </div>

        {/* A failed proof is evidence, not a detail: render it open and never let a fan
            miss it behind a disclosure. */}
        <Collapsible defaultOpen={check ? !check.ok : false}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between px-0">
              <span>⛓ Check it yourself</span>
              <span aria-hidden="true" className="text-muted-foreground">Show proof detail</span>
            </Button>
          </CollapsibleTrigger>

          <CollapsibleContent className="proof-detail overflow-hidden">
            <div className="flex flex-col gap-3 pt-3">
              <div>
                <ReceiptLabel>TxLINE score root (verified against)</ReceiptLabel>
                <code className="mono receipt-bar">{toHex(receipt.scoreRoot)}</code>
                <a
                  className="mono receipt-bar mt-1.5 block"
                  href={`https://explorer.solana.com/address/${scoresRootPda(fixtureId).toBase58()}?cluster=devnet`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Published in a TxLINE-owned account ↗
                </a>
                {check && !check.ok && (
                  <>
                    <ReceiptLabel className="mt-1.5">Root recomputed here (does not match)</ReceiptLabel>
                    <code className="mono receipt-bar text-destructive">{toHex(check.computedRoot)}</code>
                  </>
                )}
              </div>
              <div>
                <ReceiptLabel>
                  Merkle path ({receipt.merklePath.length} node{receipt.merklePath.length === 1 ? "" : "s"})
                </ReceiptLabel>
                {receipt.merklePath.length === 0 ? (
                  <span className="text-[13px] text-muted-foreground">— (the Fixture leaf is the root)</span>
                ) : (
                  receipt.merklePath.map((node, i) => (
                    <code className="mono receipt-bar" key={i}>{short(toHex(node))}</code>
                  ))
                )}
              </div>
              <div>
                <ReceiptLabel>Settlement transaction</ReceiptLabel>
                <a className="mono receipt-bar" href={explorer} target="_blank" rel="noreferrer">
                  {short(receipt.signature)} ↗
                </a>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </Card>
  );
}

function ReceiptLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`receipt-label ${className ?? ""}`}>{children}</div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <div className="receipt-label">{label}</div>
      <div className={strong ? "receipt-strong" : ""}>{value}</div>
    </div>
  );
}
