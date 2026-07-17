import { PrivyClient } from "@privy-io/server-auth";
import { createClient } from "@supabase/supabase-js";

// Server trust boundary for all social-layer writes: verify the caller's Privy access
// token, resolve their embedded Solana wallet, and write with the service-role key
// (anon clients have SELECT only — see supabase/setup.sql).

const privy =
  process.env.PRIVY_APP_SECRET && process.env.NEXT_PUBLIC_PRIVY_APP_ID
    ? new PrivyClient(process.env.NEXT_PUBLIC_PRIVY_APP_ID, process.env.PRIVY_APP_SECRET)
    : null;

export const db =
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;

export function configured(): boolean {
  return !!privy && !!db;
}

/** Verify the Bearer token and return the caller's embedded Solana wallet, or null. */
export async function callerWallet(req: Request): Promise<string | null> {
  if (!privy) return null;
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return null;
  try {
    const { userId } = await privy.verifyAuthToken(token);
    const user = await privy.getUser(userId);
    const sol = user.linkedAccounts.find(
      (a) => a.type === "wallet" && "chainType" in a && a.chainType === "solana",
    );
    return sol && "address" in sol ? (sol.address as string) : null;
  } catch {
    return null;
  }
}

export function unauthorized() {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

export function unconfigured() {
  return Response.json(
    { error: "server not configured (PRIVY_APP_SECRET / SUPABASE_SERVICE_ROLE_KEY)" },
    { status: 501 },
  );
}
