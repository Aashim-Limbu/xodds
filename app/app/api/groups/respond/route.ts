import { callerWallet, configured, db, unauthorized, unconfigured } from "@/lib/server/auth";

/** Accept or decline the caller's own pending invite. */
export async function POST(req: Request) {
  if (!configured()) return unconfigured();
  const wallet = await callerWallet(req);
  if (!wallet) return unauthorized();
  const { groupId, accept } = (await req.json()) as { groupId?: string; accept?: boolean };
  if (!groupId) return Response.json({ error: "groupId required" }, { status: 400 });

  const q = db!.from("group_members").update({ status: "member", ts: Date.now() });
  const { error } = accept
    ? await q.eq("group_id", groupId).eq("wallet", wallet).eq("status", "invited")
    : await db!.from("group_members").delete().eq("group_id", groupId).eq("wallet", wallet).eq("status", "invited");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
