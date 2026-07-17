import { callerWallet, configured, db, unauthorized, unconfigured } from "@/lib/server/auth";

/** Invite a user (by wallet) to a Group. Members only; never downgrades an existing member. */
export async function POST(req: Request) {
  if (!configured()) return unconfigured();
  const caller = await callerWallet(req);
  if (!caller) return unauthorized();
  const { groupId, wallet } = (await req.json()) as { groupId?: string; wallet?: string };
  if (!groupId || !wallet) return Response.json({ error: "groupId and wallet required" }, { status: 400 });

  const { data: me } = await db!
    .from("group_members")
    .select("status")
    .eq("group_id", groupId)
    .eq("wallet", caller)
    .eq("status", "member")
    .maybeSingle();
  if (!me) return Response.json({ error: "only members can invite" }, { status: 403 });

  // ignoreDuplicates: an existing row (member OR already-invited) is left untouched.
  const { error } = await db!.from("group_members").upsert(
    { group_id: groupId, wallet, status: "invited", invited_by: caller, ts: Date.now() },
    { onConflict: "group_id,wallet", ignoreDuplicates: true },
  );
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
