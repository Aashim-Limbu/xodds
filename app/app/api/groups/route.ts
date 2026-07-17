import { Keypair } from "@solana/web3.js";
import { callerWallet, configured, db, unauthorized, unconfigured } from "@/lib/server/auth";

/** Create a Group: fresh random pubkey id, creator becomes the first member. */
export async function POST(req: Request) {
  if (!configured()) return unconfigured();
  const wallet = await callerWallet(req);
  if (!wallet) return unauthorized();
  const { name } = (await req.json()) as { name?: string };
  const groupName = (name ?? "").trim();
  if (!groupName) return Response.json({ error: "name required" }, { status: 400 });

  const id = Keypair.generate().publicKey.toBase58();
  const now = Date.now();
  const { error } = await db!.from("groups").insert({ id, name: groupName, created_by: wallet, created_at: now });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  await db!.from("group_members").insert({ group_id: id, wallet, status: "member", ts: now });
  return Response.json({ id, name: groupName });
}
