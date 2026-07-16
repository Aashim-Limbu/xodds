import { NextResponse } from "next/server";
import { finalisedFeedLines, liveScore, normalizeScores, pick1x2Probabilities, pickGoalLines, type OddsPayload, type TxlineLive } from "@/lib/txline";

// Server-side proxy to the real TxLINE devnet feed. Holds the API token so it never reaches
// the browser (the trust boundary — same as the faucet route). Returns real Reference Odds +
// Feed lines when TXLINE_API_TOKEN is set; an empty object otherwise, so the UI keeps its
// static fixture fallback (lib/fixtures.ts) and the demo runs with no credentials.
//
// Getting a token is a one-time ops step (guest JWT -> on-chain subscribe -> activate); see
// keeper/txline-live.ts. Set TXLINE_API_TOKEN (and optionally TXLINE_JWT / TXLINE_ORIGIN) in
// .env.local, no NEXT_PUBLIC prefix.
const ORIGIN = process.env.TXLINE_ORIGIN ?? "https://txline-dev.txodds.com";

async function guestJwt(): Promise<string> {
  const res = await fetch(`${ORIGIN}/auth/guest/start`, { method: "POST" });
  if (!res.ok) throw new Error(`guest auth ${res.status}`);
  return ((await res.json()) as { token: string }).token;
}

export async function GET(req: Request): Promise<Response> {
  const apiToken = process.env.TXLINE_API_TOKEN;
  const fixtureId = new URL(req.url).searchParams.get("fixtureId");
  if (!apiToken || !fixtureId) return NextResponse.json({} satisfies TxlineLive);

  try {
    const jwt = process.env.TXLINE_JWT ?? (await guestJwt());
    const headers = { Authorization: `Bearer ${jwt}`, "X-Api-Token": apiToken };
    const [oddsRes, scoresRes] = await Promise.all([
      fetch(`${ORIGIN}/api/odds/snapshot/${fixtureId}`, { headers }),
      fetch(`${ORIGIN}/api/scores/snapshot/${fixtureId}`, { headers }),
    ]);

    const out: TxlineLive = {};
    if (oddsRes.ok) {
      const odds = (await oddsRes.json()) as OddsPayload[];
      out.referenceProbabilities = pick1x2Probabilities(odds);
      const goalLines = pickGoalLines(odds);
      if (goalLines.length) out.goalLines = goalLines;
    }
    if (scoresRes.ok) {
      // Live feed fields are PascalCase; normalise before the camelCase helpers.
      const records = normalizeScores((await scoresRes.json()) as Array<Record<string, unknown>>);
      const lines = finalisedFeedLines(records);
      if (lines.length) out.matchEvents = lines;
      out.score = liveScore(records);
    }
    return NextResponse.json(out, { headers: { "Cache-Control": "s-maxage=30" } });
  } catch {
    // Any feed hiccup falls back to static fixtures rather than breaking the Pool view.
    return NextResponse.json({} satisfies TxlineLive);
  }
}
