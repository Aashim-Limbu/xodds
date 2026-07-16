import { callerWallet, configured, db, unauthorized, unconfigured } from "@/lib/server/auth";

/** Upsert the caller's profile at sign-in — the registry that makes friend search work. */
export async function POST(req: Request) {
  if (!configured()) return unconfigured();
  const wallet = await callerWallet(req);
  if (!wallet) return unauthorized();
  const { name, email } = (await req.json()) as { name?: string; email?: string };
  const display_name = (name ?? "").trim() || wallet.slice(0, 6);
  // Insert-once keeps created_at = first sign-in; the update refreshes the mutable fields.
  await db!.from("users").upsert(
    { wallet, display_name, email: email ?? null, created_at: Date.now() },
    { onConflict: "wallet", ignoreDuplicates: true },
  );
  const { error } = await db!.from("users").update({ display_name, email: email ?? null }).eq("wallet", wallet);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
