import { NextResponse } from "next/server";
import { hasFinalised, normalizeScores } from "@/lib/txline";

// Which already-kicked-off Fixtures the scores feed reports finalised, for the games-list
// ENDED badge. Token stays server-side (same trust boundary as the sibling txline routes).
// The client sends only started fixtureIds (kickoff <= now) — future games can't be finalised,
// so there's nothing to ask about. No batch endpoint upstream, so we fan out one snapshot per id.
const ORIGIN = process.env.TXLINE_ORIGIN ?? "https://txline-dev.txodds.com";

// Reuse one guest JWT across requests instead of minting one per 60s poll per client.
// ponytail: fixed 10-min TTL, not decoded from the JWT's exp — a re-mint on a 401 would be
// tighter, add it if guest tokens ever expire sooner.
let jwtCache: { token: string; ts: number } | null = null;
const JWT_TTL_MS = 10 * 60 * 1000;

async function guestJwt(): Promise<string> {
  if (jwtCache && Date.now() - jwtCache.ts < JWT_TTL_MS) return jwtCache.token;
  const res = await fetch(`${ORIGIN}/auth/guest/start`, { method: "POST" });
  if (!res.ok) throw new Error(`guest auth ${res.status}`);
  const token = ((await res.json()) as { token: string }).token;
  jwtCache = { token, ts: Date.now() };
  return token;
}

export async function GET(req: Request): Promise<Response> {
  const apiToken = process.env.TXLINE_API_TOKEN;
  const ids = new URL(req.url).searchParams.get("ids");
  if (!apiToken || !ids) return NextResponse.json({ ended: [] });
  // Cap the fan-out; only started games are ever passed, so this is normally 1–2.
  const list = ids.split(",").filter(Boolean).slice(0, 30);

  try {
    const jwt = process.env.TXLINE_JWT ?? (await guestJwt());
    const headers = { Authorization: `Bearer ${jwt}`, "X-Api-Token": apiToken };
    const ended = (
      await Promise.all(
        list.map(async (id) => {
          const res = await fetch(`${ORIGIN}/api/scores/snapshot/${id}`, { headers });
          if (!res.ok) return null;
          const recs = normalizeScores((await res.json()) as Array<Record<string, unknown>>);
          return hasFinalised(recs) ? id : null;
        }),
      )
    ).filter((id): id is string => id !== null);
    return NextResponse.json({ ended }, { headers: { "Cache-Control": "s-maxage=30" } });
  } catch {
    // Feed hiccup -> nothing finalised; cards stay OPEN/LIVE off the clock rather than breaking.
    return NextResponse.json({ ended: [] });
  }
}
