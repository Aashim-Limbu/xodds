import { PublicKey } from "@solana/web3.js";
import { callerWallet, configured, db, unauthorized, unconfigured } from "@/lib/server/auth";

/** Self-join via an invite link — clicking the link IS consent, so this adds the caller
 * directly as a member (and upgrades a pending invite if one exists). Creates the groups
 * row for links minted before the groups table existed. */
export async function POST(req: Request) {
  if (!configured()) return unconfigured();
  const wallet = await callerWallet(req);
  if (!wallet) return unauthorized();
  const { groupId, name } = (await req.json()) as { groupId?: string; name?: string };
  if (!groupId) return Response.json({ error: "groupId required" }, { status: 400 });
  try {
    new PublicKey(groupId);
  } catch {
    return Response.json({ error: "invalid group id" }, { status: 400 });
  }

  const now = Date.now();
  await db!.from("groups").upsert(
    { id: groupId, name: (name ?? "").trim() || "Group", created_by: wallet, created_at: now },
    { onConflict: "id", ignoreDuplicates: true },
  );
  const { error } = await db!.from("group_members").upsert(
    { group_id: groupId, wallet, status: "member", ts: now },
    { onConflict: "group_id,wallet" },
  );
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
