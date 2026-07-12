import { PublicKey } from "@solana/web3.js";

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing env ${name} — copy .env.example to .env.local and fill it in.`);
  return value;
}

export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com";

export const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";

// Rented realtime backend for the Feed (ADR-0006). When unset, the Feed is disabled and
// prompts for setup — the rest of the app still works.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const FEED_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID || "3twLVgxWB3fF6EkHGoNzH4ax8sH82fz2KZjgjwg4y7fs",
);

/** The USDC-like mint Pools escrow. Required to create/enter a Pool. */
export function usdcMint(): PublicKey {
  return new PublicKey(required("NEXT_PUBLIC_USDC_MINT", process.env.NEXT_PUBLIC_USDC_MINT));
}

/** The Group every demo Pool belongs to (single-group demo); defaults to the program id.
 * Uses `||` so a blank env var falls back instead of becoming an invalid empty pubkey. */
export function groupId(): PublicKey {
  return new PublicKey(process.env.NEXT_PUBLIC_GROUP || PROGRAM_ID.toBase58());
}

export const USDC_DECIMALS = 6;

// A created Pool's kickoff is set this many seconds from now, so it Opens immediately and
// becomes lockable shortly after — the whole lifecycle is demoable without waiting for a
// real Fixture time. (The Fixture's own kickoff is display-only.)
export const KICKOFF_OFFSET_SECONDS = Number(process.env.NEXT_PUBLIC_KICKOFF_OFFSET_SECONDS ?? 90);
