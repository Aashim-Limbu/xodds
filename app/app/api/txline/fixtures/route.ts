import { NextResponse } from "next/server";
import type { TxFixture } from "@/lib/txline";

// Real upcoming World Cup Fixtures from TxLINE, mapped to the app's Fixture shape (fixtureId
// serialized as a string for JSON). Empty array when no token — the UI keeps the static slate.
const ORIGIN = process.env.TXLINE_ORIGIN ?? "https://txline-dev.txodds.com";

async function guestJwt(): Promise<string> {
  const res = await fetch(`${ORIGIN}/auth/guest/start`, { method: "POST" });
  if (!res.ok) throw new Error(`guest auth ${res.status}`);
  return ((await res.json()) as { token: string }).token;
}

export async function GET(): Promise<Response> {
  const apiToken = process.env.TXLINE_API_TOKEN;
  if (!apiToken) return NextResponse.json([]);
  try {
    const jwt = process.env.TXLINE_JWT ?? (await guestJwt());
    const res = await fetch(`${ORIGIN}/api/fixtures/snapshot`, {
      headers: { Authorization: `Bearer ${jwt}`, "X-Api-Token": apiToken },
    });
    if (!res.ok) return NextResponse.json([]);
    const fixtures = ((await res.json()) as TxFixture[]).map((f) => ({
      fixtureId: String(f.FixtureId),
      home: f.Participant1IsHome ? f.Participant1 : f.Participant2,
      away: f.Participant1IsHome ? f.Participant2 : f.Participant1,
      kickoff: Math.floor(f.StartTime / 1000),
    }));
    return NextResponse.json(fixtures, { headers: { "Cache-Control": "s-maxage=300" } });
  } catch {
    return NextResponse.json([]);
  }
}
