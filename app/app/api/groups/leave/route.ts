import { callerWallet, configured, db, unauthorized, unconfigured } from "@/lib/server/auth";

/** Remove the caller from a Group (member or invited row alike). */
export async function POST(req: Request) {
  if (!configured()) return unconfigured();
  const wallet = await callerWallet(req);
  if (!wallet) return unauthorized();
  const { groupId } = (await req.json()) as { groupId?: string };
  if (!groupId) return Response.json({ error: "groupId required" }, { status: 400 });
  const { error } = await db!.from("group_members").delete().eq("group_id", groupId).eq("wallet", wallet);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
