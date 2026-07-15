import { ImageResponse } from "next/og";
import { PublicKey } from "@solana/web3.js";
import { readOnlyClient } from "@/lib/anchorClient";
import { fixtureById } from "@/lib/fixtures";
import { receiptSummary } from "@/lib/receipt";

// The share card that renders when a /receipt/<pool> link is pasted into a chat/social feed.
// Neo-brutalist per brand.md: cream ground, ink borders, hard offset shadow, yellow PROVEN panel.
export const runtime = "nodejs";
export const alt = "xOdds Proof Receipt — proven on-chain";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#1f1b10";
const CREAM = "#fff8ef";
const YELLOW = "#ffd600";
const GREEN = "#00873c";

export default async function Image({ params }: { params: Promise<{ pool: string }> }) {
  const { pool } = await params;

  // Best-effort read; a generic branded card is better than a broken preview.
  let summary: { matchup: string; score: string; headline: string } | null = null;
  try {
    const acct = await readOnlyClient().fetchPool(new PublicKey(pool));
    if (acct.state === "settled" && acct.winningOutcome !== null) {
      summary = receiptSummary(acct.fixtureId, acct.poolType, acct.lineX2, acct.proven, acct.winningOutcome, fixtureById(acct.fixtureId));
    }
  } catch {
    /* fall through to the generic card */
  }

  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: CREAM, padding: 48, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", width: "100%", border: `10px solid ${INK}`, boxShadow: `18px 18px 0 ${INK}`, background: "#fff" }}>
          {/* PROVEN panel */}
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", width: 380, background: YELLOW, borderRight: `10px solid ${INK}` }}>
            <div style={{ fontSize: 120 }}>🏆</div>
            <div style={{ fontSize: 68, fontWeight: 900, fontStyle: "italic", letterSpacing: -2, transform: "rotate(-4deg)" }}>PROVEN</div>
          </div>
          {/* Details */}
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "56px 60px", flex: 1 }}>
            <div style={{ display: "flex", fontSize: 26, fontWeight: 700, letterSpacing: 2, color: "#4d4632" }}>xODDS · PROOF RECEIPT</div>
            {summary ? (
              <>
                <div style={{ display: "flex", fontSize: 40, fontWeight: 700, marginTop: 22 }}>{summary.matchup}</div>
                <div style={{ display: "flex", fontSize: 150, fontWeight: 900, lineHeight: 1, margin: "8px 0 6px" }}>{summary.score}</div>
                <div style={{ display: "flex", fontSize: 46, fontWeight: 900, fontStyle: "italic", color: INK }}>{summary.headline}</div>
              </>
            ) : (
              <div style={{ display: "flex", fontSize: 64, fontWeight: 900, fontStyle: "italic", marginTop: 24 }}>Settled by proof, not a house.</div>
            )}
            <div style={{ display: "flex", alignItems: "center", marginTop: 30, fontSize: 28, fontWeight: 800, color: GREEN }}>
              ✓ Verified on-chain · nobody chose this outcome
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
