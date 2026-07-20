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

/**
 * Human countdown to a unix-seconds instant: "2d 4h", "3h 12m", "45m", "any moment now".
 * Coarse on purpose — a Match header wants "kicks off in 2d", not a ticking clock.
 * Returns null once the instant has passed, so callers can switch to a live/ended state.
 */
export function timeUntil(unixSeconds: number, nowMs = Date.now()): string | null {
  const secs = unixSeconds - Math.floor(nowMs / 1000);
  if (secs <= 0) return null;
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return `${m}m`;
  return "any moment now";
}
