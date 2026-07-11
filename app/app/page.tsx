"use client";

import { useState } from "react";
import { SignIn } from "@/components/SignIn";
import { CreatePool } from "@/components/CreatePool";
import { PoolList } from "@/components/PoolList";
import { useFinalWhistle } from "@/lib/useFinalWhistle";

export default function Home() {
  const { authenticated, client } = useFinalWhistle();
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="container">
      <div className="header">
        <div className="brand">Final<span>Whistle</span></div>
        <SignIn />
      </div>

      {!authenticated || !client ? (
        <div className="panel">
          <h1>Back your call, settled by proof.</h1>
          <p className="muted">
            Put real USDC into shared parimutuel Pools with friends on 2026 World Cup Fixtures. Sign
            in with email — an embedded wallet is created for you, no seed phrase. Every Pool
            auto-settles from a TxLINE Score Proof, so nobody, including us, chooses the outcome.
          </p>
        </div>
      ) : (
        <>
          <CreatePool onCreated={() => setRefreshKey((k) => k + 1)} />
          <h2 style={{ margin: "20px 0 12px" }}>Pools</h2>
          <PoolList refreshKey={refreshKey} />
        </>
      )}
    </div>
  );
}
