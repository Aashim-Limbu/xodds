"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { BottomNav, NavBar } from "@/components/NavBar";
import { PoolView } from "@/components/PoolView";
import { useFinalWhistle } from "@/lib/useFinalWhistle";

export default function PoolPage({ params }: { params: Promise<{ pool: string }> }) {
  const { pool } = use(params);
  const { authenticated, client } = useFinalWhistle();
  const router = useRouter();
  const goHome = (t: string) => router.push(`/?tab=${t}`);

  return (
    <>
      <NavBar onTab={goHome} />
      <div className="container">
        {!authenticated || !client ? (
          <div className="panel muted">Sign in to view this Pool.</div>
        ) : (
          <PoolView address={pool} />
        )}
      </div>
      <BottomNav onTab={goHome} />
    </>
  );
}
