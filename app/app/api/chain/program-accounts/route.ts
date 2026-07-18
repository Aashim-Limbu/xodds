import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { RPC_URL, PROGRAM_ID } from "@/lib/config";

// getProgramAccounts is BLOCKED on Alchemy's free tier, so this scan can't use SOLANA_RPC_URL
// (Alchemy). It stays on the permissive public RPC (or SCAN_RPC_URL — e.g. Helius free, which
// allows the method). Low risk: this route is cached (5s) and hit on mount, not polled, so it's
// a handful of calls, not the per-tab 4s storm the account route carried.
const SERVER_RPC_URL = process.env.SCAN_RPC_URL || RPC_URL;

// Server-side cached proxy for the Pool-list scan (getProgramAccounts) — the heaviest call and
// the first to 429 on public devnet. Scoped to a Group via the `group` memcmp at offset 8 (the
// same filter listPools uses). Returns raw base64 rows; the client decodes each with its coder.
export const dynamic = "force-dynamic";

const conn = new Connection(SERVER_RPC_URL, "confirmed");
const TTL_MS = 5000;
type Rows = Array<{ pubkey: string; data: string }>;
const cache = new Map<string, { rows: Rows; ts: number }>();
const inflight = new Map<string, Promise<Rows>>();

async function scan(group: string): Promise<Rows> {
  const raw = await conn.getProgramAccounts(PROGRAM_ID, {
    filters: [{ memcmp: { offset: 8, bytes: group } }],
  });
  return raw.map((r) => ({ pubkey: r.pubkey.toBase58(), data: r.account.data.toString("base64") }));
}

export async function GET(req: Request): Promise<Response> {
  const group = new URL(req.url).searchParams.get("group");
  if (!group) return NextResponse.json({ error: "missing group" }, { status: 400 });
  try {
    new PublicKey(group); // reject junk before it reaches the RPC
  } catch {
    return NextResponse.json({ error: "bad group" }, { status: 400 });
  }

  const now = Date.now();
  const hit = cache.get(group);
  if (hit && now - hit.ts < TTL_MS) return NextResponse.json(hit.rows);

  try {
    let p = inflight.get(group);
    if (!p) {
      p = scan(group).finally(() => inflight.delete(group));
      inflight.set(group, p);
    }
    const rows = await p;
    cache.set(group, { rows, ts: now });
    return NextResponse.json(rows);
  } catch {
    if (hit) return NextResponse.json(hit.rows); // serve stale on an RPC hiccup
    return NextResponse.json({ error: "rpc" }, { status: 502 });
  }
}
