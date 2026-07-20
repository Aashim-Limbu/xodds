"use client";

import type { PoolTypeName } from "@/lib/anchorClient";
import { formatUsdc } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { ProofReceipt } from "@/components/ProofReceipt";
import { MatchBanner } from "@/components/MatchBanner";
import type { Fixture } from "@/lib/fixtures";

/**
 * A settled Pool. The market is over, so the market grid is gone: this reads
 * result -> payout -> proof -> rematch. The Proof Receipt is the hero (PRODUCT.md),
 * so nothing competes with it above the fold except the money.
 */
export function SettledPool({
  pool,
  fixture,
  address,
  labels,
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
  /** Teams for the header banner; undefined when the Fixture no longer resolves. */
  fixture?: Fixture;
  address: string;
  labels: string[];
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
  const won = claimStatus === "paid" || !!myWinEntry;

  return (
    <div className="flex flex-col gap-4">
      {/* Same banner as a live Pool: flags, Pool Type, state chip, pot. A settled Pool is
          still a match between two teams, and the header is where you look to see which. */}
      <MatchBanner
        fixture={fixture}
        fixtureId={pool.fixtureId}
        poolType={pool.poolType}
        lineX2={pool.lineX2}
        state="settled"
        pot={pool.pot}
      />

      {/* The result is the payoff moment, so it leads with what happened to YOU, not the
          neutral fact — the winning Outcome is restated by the Proof Receipt right below.
          Losers get a straight, warm answer rather than a greyed-out nothing. */}
      <div className={`result-card ${won ? "is-win" : played ? "is-lost" : "is-bystander"}`}>
        <span className="result-sticker" aria-hidden="true">{won ? "🎉" : played ? "😤" : "⚽"}</span>
        <div className="result-body">
          <span className="result-kicker">
            {winning !== null ? labels[winning] : "No paying Outcome"} · proven
          </span>
          <strong className="result-headline">
            {won ? `You won $${formatUsdc(paidAmount ?? myPayout)}` : played ? "Not your day" : "That's full time"}
          </strong>
          <span className="result-sub">
            {played ? (
              <>
                You backed{" "}
                {backed.map((b, i) => (
                  <span key={b.outcome}>
                    {i > 0 ? ", " : ""}
                    {labels[b.outcome]} · ${formatUsdc(b.amount)}
                  </span>
                ))}
                {won ? "" : " — it didn't come in. Run it back below."}
              </>
            ) : (
              "You sat this one out. The proof is below either way."
            )}
          </span>
        </div>

        {claimStatus === "paid" && <span className="result-tag">✅ Paid to your wallet</span>}
        {myWinEntry && claimStatus === "claiming" && (
          <span className="result-tag" role="status">Claiming your ${formatUsdc(myPayout)}…</span>
        )}
        {myWinEntry && claimStatus === "idle" && (
          <Button variant="primary" size="lg" disabled={busy || !canAct} onClick={onClaim}>
            Claim ${formatUsdc(myPayout)}
          </Button>
        )}
      </div>

      {error && <p className="error">{error}</p>}

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
