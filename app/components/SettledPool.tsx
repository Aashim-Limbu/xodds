"use client";

import type { PoolTypeName } from "@/lib/anchorClient";
import type { Fixture } from "@/lib/fixtures";
import { formatUsdc } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProofReceipt } from "@/components/ProofReceipt";

/**
 * A settled Pool. The market is over, so the market grid is gone: this reads
 * result -> payout -> proof -> rematch. The Proof Receipt is the hero (PRODUCT.md),
 * so nothing competes with it above the fold except the money.
 */
export function SettledPool({
  pool,
  address,
  labels,
  fixture,
  myEntries,
  myPayout,
  claimStatus,
  paidAmount,
  busy,
  canAct,
  onClaim,
  onRematch,
  error,
}: {
  pool: {
    fixtureId: bigint;
    poolType: PoolTypeName;
    lineX2: number;
    winningOutcome: number | null;
    pot: bigint;
  };
  address: string;
  labels: string[];
  fixture: Fixture | undefined;
  myEntries: Record<number, bigint | undefined>;
  myPayout: bigint;
  claimStatus: "idle" | "claiming" | "paid";
  paidAmount: bigint | null;
  busy: boolean;
  canAct: boolean;
  onClaim: () => void;
  onRematch: () => void;
  error: string | null;
}) {
  const winning = pool.winningOutcome;
  const myWinEntry = winning !== null ? myEntries[winning] : undefined;
  // What did I actually back? A losing Member still gets a straight answer, not a
  // dead button — the receipt has to be legible to winners and losers alike.
  const backed = Object.entries(myEntries)
    .filter(([, v]) => v && v > 0n)
    .map(([o, v]) => ({ outcome: Number(o), amount: v as bigint }));
  const played = backed.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <Card className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* State carries a text label, never colour alone. */}
          <Badge variant="secondary">Settled</Badge>
          <span className="text-[13px] text-muted-foreground">
            ${formatUsdc(pool.pot)} pot
          </span>
        </div>

        {fixture && winning !== null && (
          <div className="font-display text-2xl font-extrabold uppercase">
            {labels[winning]}
          </div>
        )}

        {played && (
          <div className="text-sm font-semibold">
            You backed{" "}
            {backed.map((b, i) => (
              <span key={b.outcome}>
                {i > 0 ? ", " : ""}
                {labels[b.outcome]} · ${formatUsdc(b.amount)}
              </span>
            ))}
          </div>
        )}

        {claimStatus === "paid" && (
          <p className="entry-note m-0">✅ Paid ${formatUsdc(paidAmount ?? 0n)} to your wallet.</p>
        )}
        {myWinEntry && claimStatus === "claiming" && (
          <p className="entry-note m-0">🎉 Claiming your ${formatUsdc(myPayout)} payout…</p>
        )}
        {myWinEntry && claimStatus === "idle" && (
          <Button variant="primary" size="lg" disabled={busy || !canAct} onClick={onClaim}>
            Claim ${formatUsdc(myPayout)}
          </Button>
        )}
        {played && !myWinEntry && claimStatus !== "paid" && (
          <p className="m-0 text-sm text-muted-foreground">
            No payout this time — your Outcome didn&rsquo;t come in. The proof is below.
          </p>
        )}

        {error && <p className="error">{error}</p>}
      </Card>

      <ProofReceipt
        address={address}
        fixtureId={pool.fixtureId}
        poolType={pool.poolType}
        lineX2={pool.lineX2}
      />

      <Button variant="secondary" disabled={busy || !canAct} onClick={onRematch}>
        🔁 Run it back — same Pool, new game
      </Button>
    </div>
  );
}
