// One-shot claim checker for the TxLINE scores feed. Dumps a Fixture's raw scores snapshot
// and asserts every API-shape claim the app/keeper bake in against the REAL response, so the
// settlement-critical assumptions (stat-key map, finalised signal, abandoned status) are
// pinned to observed data instead of docs. Run it against a finalised Fixture to close them.
//
//   TXLINE_API_TOKEN=... pnpm tsx keeper/probe-snapshot.ts [fixtureId]
//
// Needs the same creds as the Keeper: TXLINE_API_TOKEN (required), TXLINE_JWT (optional —
// minted as a guest otherwise), TXLINE_ORIGIN (defaults devnet).

import { parseFinalisedStats } from "./txline-live.js";

const ORIGIN = process.env.TXLINE_ORIGIN ?? "https://txline-dev.txodds.com";
const DEFAULT_FIXTURE = "18257739"; // devnet live World Cup fixture (Spain v Argentina)

// The stat-key map the app + keeper both assume (keeper/txline-live.ts, app/lib/txline.ts).
const K: Record<string, string> = {
  "1": "p1Goals", "2": "p2Goals", "3": "p1Yellow", "4": "p2Yellow",
  "5": "p1Red", "6": "p2Red", "7": "p1Corners", "8": "p2Corners",
};

let pass = 0;
let fail = 0;
function claim(ok: boolean, label: string, detail = ""): void {
  console.log(`${ok ? "  ✅" : "  ❌"} ${label}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
}

async function guestJwt(): Promise<string> {
  const res = await fetch(`${ORIGIN}/auth/guest/start`, { method: "POST" });
  if (!res.ok) throw new Error(`guest auth ${res.status}`);
  return ((await res.json()) as { token: string }).token;
}

async function main(): Promise<void> {
  const fixtureId = process.argv[2] ?? DEFAULT_FIXTURE;
  const apiToken = process.env.TXLINE_API_TOKEN;
  if (!apiToken) throw new Error("Set TXLINE_API_TOKEN — run keeper/subscribe-txline.ts to get one.");
  const jwt = process.env.TXLINE_JWT ?? (await guestJwt());

  const res = await fetch(`${ORIGIN}/api/scores/snapshot/${fixtureId}`, {
    headers: { Authorization: `Bearer ${jwt}`, "X-Api-Token": apiToken },
  });
  if (!res.ok) throw new Error(`scores snapshot ${fixtureId} failed: ${res.status} ${await res.text()}`);
  const records = (await res.json()) as Array<Record<string, unknown>>;

  console.log(`\nfixture ${fixtureId} — ${records.length} record(s) from ${ORIGIN}\n`);
  console.log("=== raw records ===");
  console.log(JSON.stringify(records, null, 2));

  // Distinct Action / GameState / StatusSoccerId values actually observed.
  const actions = new Set(records.map((r) => (r.Action ?? r.action) as string).filter(Boolean));
  const gameStates = new Set(records.map((r) => r.GameState ?? r.gameState).filter((v) => v !== undefined));
  const hasStatusSoccerId = records.some((r) => (r.StatusSoccerId ?? r.statusSoccerId) !== undefined);
  const withStats = records.filter((r) => {
    const s = (r.Stats ?? r.stats) as Record<string, number> | undefined;
    return s && Object.keys(s).length > 0;
  });

  console.log("\n=== observed vocabulary ===");
  console.log("Action values:      ", [...actions]);
  console.log("GameState values:   ", [...gameStates]);
  console.log("StatusSoccerId seen:", hasStatusSoccerId);

  console.log("\n=== claim checks ===");
  // Claim: the terminal signal is Action === "game_finalised" (hasFinalised, decideAction).
  const finalised = actions.has("game_finalised");
  claim(finalised, 'terminal signal is Action="game_finalised"',
    finalised ? "present" : `NOT seen; actions=${[...actions].join("|") || "none"} (feed not finalised yet)`);

  // Claim: phase/abandoned key off StatusSoccerId (int). Real feed shape uses GameState (string).
  claim(hasStatusSoccerId,
    "records carry StatusSoccerId (code keys PHASE + ABANDONED_STATUS_IDS off it)",
    hasStatusSoccerId ? "present" : `ABSENT — feed uses GameState=${[...gameStates].join("|") || "?"} instead (known discrepancy)`);

  // Claim: stat keys "1".."8" are the goals/cards/corners fields.
  if (withStats.length === 0) {
    claim(false, 'stat keys "1".."8" present in Stats', "Stats empty on every record (fixture not live/finalised yet)");
  } else {
    const stats = (withStats[0].Stats ?? withStats[0].stats) as Record<string, number>;
    const keys = Object.keys(stats);
    for (const k of Object.keys(K)) {
      claim(k in stats, `Stats["${k}"] (${K[k]}) present`, k in stats ? `= ${stats[k]}` : `keys seen: ${keys.join(",")}`);
    }
    // Sanity: our parser produces a coherent leaf from the real record.
    const parsed = parseFinalisedStats(BigInt(fixtureId), records as never);
    console.log("\n=== parseFinalisedStats(real record) ===");
    console.log(parsed ? JSON.stringify(parsed, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2) : "null (no finalised/abandoned record)");
    claim(parsed !== null, "parseFinalisedStats maps the record to leaf stats");
  }

  console.log(`\n${pass} passed, ${fail} failed.`);
  if (fail > 0) {
    console.log("Re-run against a FINALISED fixture to pin the remaining claims; fix keeper/txline-live.ts + app/lib/txline.ts at the K/normalize locus if any key is wrong.");
    process.exitCode = 1;
  }
}

void main();
