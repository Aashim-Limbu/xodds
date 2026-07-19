import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { RPC_URL } from "@/lib/config";

// Server-only RPC (no NEXT_PUBLIC_ prefix, so it stays off the browser). Point this at a
// dedicated devnet endpoint (Helius/QuickNode/Alchemy) to end the cold-read 429s; falls
// back to the public URL when unset.
const SERVER_RPC_URL = process.env.SOLANA_RPC_URL || RPC_URL;

// Server-side cached proxy for a single account read (a Pool). Every browser tab used to poll
// the chain directly every 4s — N tabs on one IP = N× the RPC load, which 429'd the public
// devnet endpoint. Now all tabs hit this route; the server makes one cached read per TTL and
// returns raw base64 so the client decodes with its own coder (no bigint JSON serialization).
export const dynamic = "force-dynamic";

const conn = new Connection(SERVER_RPC_URL, "confirmed");
const TTL_MS = 3000;
const cache = new Map<string, { data: string | null; ts: number }>();
const inflight = new Map<string, Promise<string | null>>();

async function read(key: string): Promise<string | null> {
  const info = await conn.getAccountInfo(new PublicKey(key));
  return info ? info.data.toString("base64") : null;
}

export async function GET(req: Request): Promise<Response> {
  const key = new URL(req.url).searchParams.get("key");
  if (!key) return NextResponse.json({ error: "missing key" }, { status: 400 });
  try {
    new PublicKey(key); // reject junk before it reaches the RPC (and before it grows the cache)
  } catch {
    return NextResponse.json({ error: "bad key" }, { status: 400 });
  }

  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.ts < TTL_MS) return NextResponse.json({ data: hit.data });

  try {
    // Coalesce concurrent cold misses (the "3 tabs at once" case) into a single RPC call.
    let p = inflight.get(key);
    if (!p) {
      p = read(key).finally(() => inflight.delete(key));
      inflight.set(key, p);
    }
    const data = await p;
    cache.set(key, { data, ts: now });
    return NextResponse.json({ data });
  } catch {
    if (hit) return NextResponse.json({ data: hit.data }); // serve stale on an RPC hiccup
    return NextResponse.json({ error: "rpc" }, { status: 502 });
  }
}
