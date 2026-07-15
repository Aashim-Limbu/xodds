"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { PublicKey } from "@solana/web3.js";
import { type PoolAccount, readOnlyClient } from "@/lib/anchorClient";
import { ProofReceipt } from "@/components/ProofReceipt";

// Public, no-sign-in share page for a settled Pool's Proof Receipt — the viral artifact a
// winner drops into their group chat. All data is on-chain, read via the wallet-less client.
export default function ReceiptPage({ params }: { params: Promise<{ pool: string }> }) {
  const { pool } = use(params);
  const [account, setAccount] = useState<PoolAccount | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "notfound" | "unsettled">("loading");

  useEffect(() => {
    readOnlyClient()
      .fetchPool(new PublicKey(pool))
      .then((a) => {
        setAccount(a);
        setState(a.state === "settled" ? "ok" : "unsettled");
      })
      .catch(() => setState("notfound"));
  }, [pool]);

  return (
    <div className="container">
      <div className="header">
        <Link href="/" className="brand">
          <span>x</span>Odds
        </Link>
        <Link href="/" className="hero-btn">Open the app</Link>
      </div>

      {state === "loading" && <div className="panel muted">Loading Proof Receipt…</div>}
      {state === "notfound" && <div className="panel muted">No Pool found at this address.</div>}
      {state === "unsettled" && (
        <div className="panel muted">This Pool hasn&rsquo;t settled yet — check back at the final whistle.</div>
      )}
      {state === "ok" && account && (
        <>
          <ProofReceipt address={pool} fixtureId={account.fixtureId} poolType={account.poolType} lineX2={account.lineX2} />
          <p className="muted" style={{ textAlign: "center", marginTop: 18, fontSize: 13 }}>
            Every xOdds Pool settles like this — proven by TxLINE, verified on-chain, never chosen by a house.{" "}
            <Link href="/">Start your own Group ↗</Link>
          </p>
        </>
      )}
    </div>
  );
}
