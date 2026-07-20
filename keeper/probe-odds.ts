// READ-ONLY probe for the TxLINE odds feed. GETs /api/odds/snapshot/{fixtureId} for a set of
// fixtures and dumps every SuperOddsType, its raw MarketParameters, outcome names, Prices, and
// the full raw JSON of anything handicap-shaped. Never writes anything remote or on-chain.
//
//   TXLINE_API_TOKEN=... pnpm tsx keeper/probe-odds.ts [fixtureId ...]
//
// Same creds as keeper/probe-snapshot.ts: TXLINE_API_TOKEN (required), TXLINE_JWT (optional —
// guest-minted otherwise), TXLINE_ORIGIN (defaults devnet). Raw JSON is written to SCRATCH.

import { writeFileSync } from "node:fs";
import type { OddsPayload, TxFixture } from "../app/lib/txline.js";

const ORIGIN = process.env.TXLINE_ORIGIN ?? "https://txline-dev.txodds.com";
const SCRATCH = "/tmp/claude-1000/-home-aashim-hackathon-think/f3b78d8f-56c8-45ed-8aa9-0701c50928ad/scratchpad";

async function guestJwt(): Promise<string> {
  // ponytail: the one non-GET call, and it is the documented auth handshake, not a mutation.
  const res = await fetch(`${ORIGIN}/auth/guest/start`, { method: "POST" });
  if (!res.ok) throw new Error(`guest auth ${res.status}`);
  return ((await res.json()) as { token: string }).token;
}

async function get<T>(path: string, headers: Record<string, string>): Promise<T> {
  const res = await fetch(`${ORIGIN}${path}`, { headers });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

const rawParams = (p: OddsPayload) => JSON.stringify(p.MarketParameters ?? null);
const lineOf = (p: OddsPayload): number | undefined => {
  const mp = p.MarketParameters;
  if (typeof mp === "string") { const m = /line=(-?[\d.]+)/.exec(mp); return m ? Number(m[1]) : undefined; }
  return mp?.line;
};
const isHandicap = (p: OddsPayload) => /handicap|hcp|ah|spread/i.test(p.SuperOddsType);

async function main(): Promise<void> {
  const apiToken = process.env.TXLINE_API_TOKEN;
  if (!apiToken) throw new Error("Set TXLINE_API_TOKEN — run keeper/subscribe-txline.ts to get one.");
  const jwt = process.env.TXLINE_JWT ?? (await guestJwt());
  const headers = { Authorization: `Bearer ${jwt}`, "X-Api-Token": apiToken };
  console.log(`origin=${ORIGIN} apiToken=<redacted> jwt=<redacted>`);

  let ids = process.argv.slice(2);
  const fixtures = await get<TxFixture[]>("/api/fixtures/snapshot", headers).catch(() => [] as TxFixture[]);
  if (ids.length === 0) {
    ids = fixtures.slice(0, 10).map((f) => String(f.FixtureId));
    console.log(`discovered ${ids.length} fixture(s) from /api/fixtures/snapshot`);
  }
  const homeOf = new Map(fixtures.map((f) => [String(f.FixtureId), f]));

  const typeCount = new Map<string, number>();
  const byType = new Map<string, OddsPayload[]>();
  const allLines = new Set<number>();
  const handicaps: unknown[] = [];
  const raw: Record<string, unknown> = {};

  for (const id of ids) {
    const odds = await get<OddsPayload[]>(`/api/odds/snapshot/${id}`, headers).catch((e) => {
      console.log(`  ⚠️  ${id}: ${(e as Error).message}`);
      return [] as OddsPayload[];
    });
    raw[id] = odds;
    const f = homeOf.get(id);
    console.log(`\nfixture ${id} — ${odds.length} market(s) · ${f ? `${f.Participant1} v ${f.Participant2} · Participant1IsHome=${f.Participant1IsHome}` : "Participant1IsHome=UNKNOWN (not in upcoming list)"}`);
    for (const p of odds) {
      typeCount.set(p.SuperOddsType, (typeCount.get(p.SuperOddsType) ?? 0) + 1);
      if (!byType.has(p.SuperOddsType)) byType.set(p.SuperOddsType, []);
      byType.get(p.SuperOddsType)!.push(p);
      const l = lineOf(p);
      if (l !== undefined) allLines.add(l);
      if (isHandicap(p)) handicaps.push({ fixtureId: id, market: p });
    }
  }

  console.log("\n=== 1. distinct SuperOddsType (count) ===");
  for (const [t, n] of [...typeCount].sort((a, b) => b[1] - a[1])) console.log(`  ${n.toString().padStart(4)}  ${t}`);

  console.log("\n=== 2. per type: raw MarketParameters / outcome names / Prices ===");
  for (const [t, ps] of byType) {
    console.log(`\n${t}`);
    const seen = new Set<string>();
    for (const p of ps) {
      const key = `${rawParams(p)}|${p.PriceNames.join(",")}|${p.MarketPeriod ?? ""}`;
      if (seen.has(key)) continue; // ponytail: dedupe by shape; every distinct shape still prints.
      seen.add(key);
      console.log(`  MarketParameters(raw): ${rawParams(p)}  [${typeof p.MarketParameters}]`);
      console.log(`  MarketPeriod: ${p.MarketPeriod ?? "-"}  InRunning: ${p.InRunning}`);
      console.log(`  PriceNames: ${JSON.stringify(p.PriceNames)}`);
      console.log(`  Prices: ${JSON.stringify((p as unknown as { Prices?: unknown }).Prices ?? null)}  Pct: ${JSON.stringify(p.Pct)}`);
    }
  }

  console.log("\n=== 3. handicap-shaped markets (FULL raw JSON) ===");
  console.log(handicaps.length ? JSON.stringify(handicaps, null, 2) : "  none observed");

  console.log("\n=== 4. line reference / Participant1IsHome ===");
  for (const id of ids) {
    const f = homeOf.get(id);
    console.log(`  ${id}: Participant1IsHome=${f ? f.Participant1IsHome : "unknown"} · P1=${f?.Participant1 ?? "?"} P2=${f?.Participant2 ?? "?"}`);
  }
  console.log("  (lines are quoted relative to Participant1 unless a market's PriceNames say otherwise — compare against the raw dumps above)");

  console.log("\n=== 5. distinct line values across all fixtures ===");
  console.log(`  ${[...allLines].sort((a, b) => a - b).join(", ") || "none"}`);

  const out = `${SCRATCH}/odds-probe.json`;
  writeFileSync(out, JSON.stringify(raw, null, 2));
  console.log(`\nraw JSON → ${out}`);
}

void main();
