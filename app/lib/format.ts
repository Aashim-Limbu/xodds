import { USDC_DECIMALS } from "./config";

const USDC_UNIT = 10 ** USDC_DECIMALS;

/** Format base-unit USDC (bigint/number) as a human dollar string, e.g. 1_500_000 -> "1.50". */
export function formatUsdc(base: bigint | number): string {
  const n = typeof base === "bigint" ? Number(base) : base;
  return (n / USDC_UNIT).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Parse a dollar string ("1.5") to base units (1_500_000n). */
export function parseUsdc(dollars: string): bigint {
  const n = Number(dollars);
  if (!Number.isFinite(n) || n < 0) throw new Error("Enter a valid amount");
  return BigInt(Math.round(n * USDC_UNIT));
}

/** Implied probability -> decimal odds for display (Reference Odds are display-only). */
export function decimalOdds(impliedProbability: number): string {
  if (impliedProbability <= 0) return "—";
  return (1 / impliedProbability).toFixed(2);
}

/** Short middle-elided address, e.g. "3twL…y7fs". */
export function shortAddress(s: string): string {
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

/** The local-part of an email ("jane.doe@x.com" -> "jane.doe"), or null. */
export function emailLocalPart(email: string | null | undefined): string | null {
  const local = email?.split("@")[0]?.trim();
  return local || null;
}

/** The default name a User posts/appears as: email local-part (never the full email —
 * that would leak into the public Feed), else short wallet, else "anon". A saved custom
 * name (see useMyName) takes precedence over this. */
export function feedDisplayName(email: string | null | undefined, wallet: string | null | undefined): string {
  return emailLocalPart(email) ?? (wallet ? shortAddress(wallet) : "anon");
}
