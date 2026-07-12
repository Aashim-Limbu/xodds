"use client";

import { useState } from "react";
import { useFinalWhistle } from "@/lib/useFinalWhistle";

/** Self-serve devnet funding: a little SOL for fees + 100 test USDC, into the User's
 * embedded wallet, so they can create/enter Pools. Calls the server-side faucet route. */
export function GetTestFunds() {
  const { address } = useFinalWhistle();
  const [state, setState] = useState<"idle" | "funding" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function fund() {
    if (!address) return;
    setState("funding");
    setError(null);
    try {
      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "faucet failed");
      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState("idle");
    }
  }

  return (
    <div className="panel row between">
      <div className="stack" style={{ gap: 2 }}>
        <strong>Test funds</strong>
        <span className="muted" style={{ fontSize: 13 }}>
          {state === "done" ? "Funded — 0.05 SOL + 100 USDC in your wallet." : "Get devnet SOL + 100 test USDC to play."}
        </span>
        {error && <span className="error">{error}</span>}
      </div>
      <button className="secondary" onClick={fund} disabled={state === "funding" || !address}>
        {state === "funding" ? "Funding…" : state === "done" ? "Get more" : "Get test funds"}
      </button>
    </div>
  );
}
