"use client";

import { use } from "react";
import Link from "next/link";
import { SignIn } from "@/components/SignIn";
import { PoolView } from "@/components/PoolView";
import { useFinalWhistle } from "@/lib/useFinalWhistle";

export default function PoolPage({ params }: { params: Promise<{ pool: string }> }) {
  const { pool } = use(params);
  const { authenticated, client } = useFinalWhistle();

  return (
    <div className="container">
      <div className="header">
        <Link href="/" className="brand" style={{ textDecoration: "none" }}>
          Final<span>Whistle</span>
        </Link>
        <SignIn />
      </div>
      {!authenticated || !client ? (
        <div className="panel muted">Sign in to view this Pool.</div>
      ) : (
        <PoolView address={pool} />
      )}
    </div>
  );
}
