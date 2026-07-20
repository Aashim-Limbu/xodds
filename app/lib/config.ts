import { PublicKey } from "@solana/web3.js";

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing env ${name} — copy .env.example to .env.local and fill it in.`);
  return value;
}

export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com";

/** Derived from the RPC so the Explorer links and Privy's funding flow can't disagree. */
export const CLUSTER: "mainnet-beta" | "devnet" | "testnet" = RPC_URL.includes("devnet")
  ? "devnet"
  : RPC_URL.includes("testnet")
    ? "testnet"
    : "mainnet-beta";

/** The same cluster as a CAIP-2 chain id, which is how Privy v3 identifies Solana chains. */
export const SOLANA_CHAIN = `solana:${CLUSTER === "mainnet-beta" ? "mainnet" : CLUSTER}` as const;

export const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";

// Rented realtime backend for the Feed (ADR-0006). When unset, the Feed is disabled and
// prompts for setup — the rest of the app still works.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const FEED_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID || "3twLVgxWB3fF6EkHGoNzH4ax8sH82fz2KZjgjwg4y7fs",
);

// The txline_mock scores-publisher program (ADR-0008). A score root is only trusted because its
// account is owned by this program — the Proof Receipt links to it so anyone can check the owner.
export const TXLINE_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_TXLINE_PROGRAM_ID || "7yYhmy4x1HLW9yDUKFAewbbcigZ9DtSoMFBA6xswAA2J",
);

/** The USDC-like mint Pools escrow. Required to create/enter a Pool. */
export function usdcMint(): PublicKey {
  return new PublicKey(required("NEXT_PUBLIC_USDC_MINT", process.env.NEXT_PUBLIC_USDC_MINT));
}

export const USDC_DECIMALS = 6;

/**
 * Circle's USDC on Solana mainnet — the asset the deposit flow onboards.
 *
 * Deliberately NOT `usdcMint()`: off mainnet, Pools escrow a local test mint that no
 * bridge or on-ramp can source, so Privy's deposit-address flow answers ROUTE_UNAVAILABLE.
 * Quoting the real mint keeps the onboarding path demoable, and at mainnet the two
 * constants converge on the same token.
 */
export const DEPOSIT_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

/** Deposits route over mainnet — that's where USDC liquidity exists, whatever we bet on. */
export const DEPOSIT_CHAIN = "solana:mainnet" as const;

// Fallback only: when a Fixture has no real kickoff (the static demo slate), a created Pool's
// kickoff is set this many seconds from now so the whole lifecycle is demoable without waiting.
export const KICKOFF_OFFSET_SECONDS = Number(process.env.NEXT_PUBLIC_KICKOFF_OFFSET_SECONDS ?? 90);

/**
 * The kickoff to stamp on a new Pool. Uses the Fixture's REAL kickoff (TxLINE StartTime) so the
 * Pool Locks when the match actually starts and the Keeper's grace window lines up with a
 * result that can exist. A kickoff already in the past — or a Fixture with none — falls back to
 * the demo offset, otherwise the Pool would be born instantly lockable and void out unsettled.
 */
export function poolKickoffTs(fixtureKickoff?: number): number {
  const now = Math.floor(Date.now() / 1000);
  return fixtureKickoff && fixtureKickoff > now ? fixtureKickoff : now + KICKOFF_OFFSET_SECONDS;
}
