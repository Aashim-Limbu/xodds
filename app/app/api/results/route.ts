import { callerWallet, configured, db, unauthorized, unconfigured } from "@/lib/server/auth";

/** Record the caller's own settled-Pool result — write-once per (pool, wallet). The wallet
 * comes from the verified Privy token, never the body, so standings can't be forged for
 * someone else. Amounts remain self-reported (chain-verifying them is a keeper concern). */
export async function POST(req: Request) {
  if (!configured()) return unconfigured();
  const wallet = await callerWallet(req);
  if (!wallet) return unauthorized();
  const { pool, channel, name, staked, won, ts } = (await req.json()) as {
    pool?: string; channel?: string; name?: string; staked?: string; won?: string; ts?: number;
  };
  if (!pool || !channel || !/^\d+$/.test(staked ?? "") || !/^\d+$/.test(won ?? "")) {
    return Response.json({ error: "pool, channel, staked, won required" }, { status: 400 });
  }
  const { error, count } = await db!
    .from("pool_results")
    .upsert(
      { id: `${pool}:${wallet}`, pool, channel, wallet, name: (name ?? "").trim() || wallet.slice(0, 6), staked, won, ts: ts ?? Date.now() },
      { onConflict: "id", ignoreDuplicates: true, count: "exact" },
    );
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ recorded: (count ?? 0) > 0 });
}
