"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { PublicKey } from "@solana/web3.js";
import { BottomNav, NavBar } from "@/components/NavBar";
import { MatchView } from "@/components/MatchView";
import { useFinalWhistle } from "@/lib/useFinalWhistle";

export default function MatchPage({
  params,
}: {
  params: Promise<{ group: string; fixture: string }>;
}) {
  const { group, fixture } = use(params);
  const { authenticated, client } = useFinalWhistle();
  const router = useRouter();
  const goHome = (t: string) => router.push(`/?tab=${t}`);

  return (
    <>
      <NavBar onTab={goHome} />
      <div className="container">
        {!authenticated || !client ? (
          <div className="panel muted">Sign in to view this Match.</div>
        ) : (
          <MatchView group={new PublicKey(group)} fixtureId={BigInt(fixture)} />
        )}
      </div>
      <BottomNav onTab={goHome} />
    </>
  );
}
