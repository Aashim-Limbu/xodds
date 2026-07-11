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
