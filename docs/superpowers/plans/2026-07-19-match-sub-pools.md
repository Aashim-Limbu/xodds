# Matches (sub-pools per Fixture) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group a Fixture's market Pools (Match Winner, Total Goals, Corners, Cards) into one "Match" page with a single Room and a single Proof Receipt, and remove the "now pick a market" prompt from Pool creation.

**Architecture:** Purely client-side. The Anchor program is NOT touched. Pool PDA seeds already include `pool_type` (`programs/finalwhistle/src/lib.rs:346-360`), so several market Pools already coexist per `(group, fixture_id)`. A "Match" is derived at runtime by grouping `PoolAccount[]` on `fixtureId` — it has no account, no database row, and no id of its own. Market Pools are created lazily, when someone first backs that market.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Vitest, `@coral-xyz/anchor`, Supabase (social layer only), existing `legacy.css` design system.

**Spec:** `docs/superpowers/specs/2026-07-19-match-sub-pools-design.md`

## Global Constraints

- **No program changes.** No edits under `programs/`, no redeploy, no IDL change, no migration.
- **Domain language is fixed.** A **Pool** is one market question (`CONTEXT.md:7`). A **Match** is the container: `(group, fixtureId)`. Never rename Pool to mean the container.
- **Handicap/spread is out of scope.** It needs a new `PoolType` and breaks the odd-`line_x2` invariant (`lib.rs:50-56`). Do not add it.
- **Existing routes must keep working:** `/pool/<address>` and `/receipt/<address>`. The receipt share link is the product's hero artifact and live links must not break.
- **Pool state is never signalled by colour alone** — always a text label (PRODUCT.md, WCAG AA).
- **Money-path rule:** if a transaction did not take the user's money, the message must say so explicitly.
- Tests live in `/home/aashim/hackathon/think/tests/` and import app code with a `.js` extension, e.g. `import { x } from "../app/lib/markets.js"`.
- Run tests from the repo root: `npx vitest run <path>`.
- Typecheck from `app/`: `npx tsc --noEmit`.

## File Structure

| File | Responsibility |
|---|---|
| `app/lib/markets.ts` *(new)* | Market catalogue + `groupByFixture`. Pure functions, no I/O. |
| `app/lib/openMarket.ts` *(new)* | `findOrOpenPool` — the find-or-join race handler. Only file that creates Pools. |
| `app/components/MatchCard.tsx` *(new)* | One Match in the grid: fixture, aggregate pot, market count. |
| `app/components/MarketSection.tsx` *(new)* | One market's outcomes + backing, incl. the unopened state. |
| `app/components/MatchView.tsx` *(new)* | Match page: banner + MarketSections + one Room. |
| `app/components/MatchReceipt.tsx` *(new)* | One proof, per-market result rows. |
| `app/app/match/[group]/[fixture]/page.tsx` *(new)* | Route for the Match page. |
| `app/components/PoolList.tsx` *(modify)* | Render Matches instead of Pools. |
| `app/components/GameBrowser.tsx` *(modify)* | Navigate to Match page; drop CreatePoolModal. |
| `app/components/CreatePoolModal.tsx` *(delete)* | Replaced by the Match page. |
| `app/lib/groups.ts` | `recordFixture` unchanged; its **call site moves** to `openMarket.ts`. |

---

### Task 1: Market catalogue and Fixture grouping

**Files:**
- Create: `app/lib/markets.ts`
- Test: `tests/markets.test.ts`

**Interfaces:**
- Consumes: `PoolAccount`, `PoolTypeName` from `app/lib/anchorClient.ts`.
- Produces:
  - `MARKETS: MarketSpec[]` where `MarketSpec = { poolType: PoolTypeName; label: string; hasLine: boolean; defaultLineX2: number; hasOdds: boolean }`
  - `marketLabel(poolType: PoolTypeName, lineX2: number): string`
  - `groupByFixture(pools: PoolAccount[]): Match[]` where `Match = { fixtureId: bigint; group: PublicKey; pools: PoolAccount[]; pot: bigint; state: MatchState }`
  - `type MatchState = "open" | "locked" | "settled" | "void"`

- [ ] **Step 1: Write the failing test**

Create `tests/markets.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { MARKETS, marketLabel, groupByFixture } from "../app/lib/markets.js";

const G = new PublicKey("11111111111111111111111111111111");

// Minimal PoolAccount stand-in — groupByFixture only reads these fields.
function pool(over: Partial<Record<string, unknown>> = {}) {
  return {
    address: PublicKey.unique(),
    group: G,
    fixtureId: 1002n,
    poolType: "matchWinner",
    lineX2: 0,
    state: "open",
    pot: 5_000_000n,
    ...over,
  } as never;
}

describe("MARKETS", () => {
  it("covers the four on-chain pool types and no others", () => {
    expect(MARKETS.map((m) => m.poolType)).toEqual([
      "matchWinner", "totalGoals", "totalCorners", "totalCards",
    ]);
  });

  it("marks corners and cards as having no TxLINE odds", () => {
    // Verified against the live API: odds exist only for 1X2 and O/U goals.
    const byType = Object.fromEntries(MARKETS.map((m) => [m.poolType, m]));
    expect(byType.matchWinner.hasOdds).toBe(true);
    expect(byType.totalGoals.hasOdds).toBe(true);
    expect(byType.totalCorners.hasOdds).toBe(false);
    expect(byType.totalCards.hasOdds).toBe(false);
  });

  it("uses odd default lines so a push is impossible", () => {
    // create_pool rejects an even line_x2 (lib.rs:50-56).
    for (const m of MARKETS.filter((m) => m.hasLine)) {
      expect(m.defaultLineX2 % 2).toBe(1);
    }
  });
});

describe("marketLabel", () => {
  it("names the 1X2 market without a line", () => {
    expect(marketLabel("matchWinner", 0)).toBe("Match Winner");
  });

  it("renders the line as a half-integer", () => {
    expect(marketLabel("totalGoals", 5)).toBe("Total Goals O/U 2.5");
    expect(marketLabel("totalCorners", 19)).toBe("Total Corners O/U 9.5");
  });
});

describe("groupByFixture", () => {
  it("groups pools of the same fixture into one Match and sums the pot", () => {
    const ms = groupByFixture([
      pool({ poolType: "matchWinner", pot: 45_000_000n }),
      pool({ poolType: "totalGoals", lineX2: 5, pot: 10_000_000n }),
    ]);
    expect(ms).toHaveLength(1);
    expect(ms[0].fixtureId).toBe(1002n);
    expect(ms[0].pools).toHaveLength(2);
    expect(ms[0].pot).toBe(55_000_000n);
  });

  it("keeps different fixtures apart", () => {
    const ms = groupByFixture([pool({ fixtureId: 1n }), pool({ fixtureId: 2n })]);
    expect(ms).toHaveLength(2);
  });

  it("is open while any pool is open", () => {
    const ms = groupByFixture([
      pool({ state: "settled" }),
      pool({ poolType: "totalGoals", state: "open" }),
    ]);
    expect(ms[0].state).toBe("open");
  });

  it("is settled only once every pool has settled or voided", () => {
    const ms = groupByFixture([
      pool({ state: "settled" }),
      pool({ poolType: "totalGoals", state: "void" }),
    ]);
    expect(ms[0].state).toBe("settled");
  });

  it("is void when every pool voided", () => {
    const ms = groupByFixture([
      pool({ state: "void" }),
      pool({ poolType: "totalGoals", state: "void" }),
    ]);
    expect(ms[0].state).toBe("void");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/markets.test.ts`
Expected: FAIL — `Failed to resolve import "../app/lib/markets.js"`.

- [ ] **Step 3: Write the implementation**

Create `app/lib/markets.ts`:

```ts
import type { PublicKey } from "@solana/web3.js";
import type { PoolAccount, PoolTypeName } from "./anchorClient";

/** One market a Fixture can carry. `defaultLineX2` is the Line x2 — always ODD, because
 * create_pool rejects an even line so that a push is arithmetically impossible (lib.rs:50-56). */
export interface MarketSpec {
  poolType: PoolTypeName;
  label: string;
  hasLine: boolean;
  defaultLineX2: number;
  /** Whether TxLINE publishes odds for this market. Verified against the live API: only 1X2
   * and Over/Under goals do. Corners and Cards settle from proven stats with no odds. */
  hasOdds: boolean;
}

export const MARKETS: MarketSpec[] = [
  { poolType: "matchWinner", label: "Match Winner", hasLine: false, defaultLineX2: 0, hasOdds: true },
  { poolType: "totalGoals", label: "Total Goals", hasLine: true, defaultLineX2: 5, hasOdds: true },
  { poolType: "totalCorners", label: "Total Corners", hasLine: true, defaultLineX2: 19, hasOdds: false },
  { poolType: "totalCards", label: "Total Cards", hasLine: true, defaultLineX2: 9, hasOdds: false },
];

export function marketLabel(poolType: PoolTypeName, lineX2: number): string {
  const spec = MARKETS.find((m) => m.poolType === poolType);
  if (!spec) return poolType;
  return spec.hasLine ? `${spec.label} O/U ${lineX2 / 2}` : spec.label;
}

export type MatchState = "open" | "locked" | "settled" | "void";

/** A Match is derived, never stored: (group, fixtureId) plus whatever Pools exist under it. */
export interface Match {
  fixtureId: bigint;
  group: PublicKey;
  pools: PoolAccount[];
  /** Combined pot across every market — each Pool keeps its own escrow; this is display only. */
  pot: bigint;
  state: MatchState;
}

/** A Match is as "live" as its liveliest Pool: open if anything is still backable, then
 * locked, and only settled once every Pool has reached a terminal state. */
function matchState(pools: PoolAccount[]): MatchState {
  if (pools.some((p) => p.state === "open")) return "open";
  if (pools.some((p) => p.state === "locked")) return "locked";
  if (pools.every((p) => p.state === "void")) return "void";
  return "settled";
}

export function groupByFixture(pools: PoolAccount[]): Match[] {
  const byFixture = new Map<string, PoolAccount[]>();
  for (const p of pools) {
    const key = p.fixtureId.toString();
    byFixture.set(key, [...(byFixture.get(key) ?? []), p]);
  }
  return [...byFixture.values()].map((group) => ({
    fixtureId: group[0].fixtureId,
    group: group[0].group,
    pools: group,
    pot: group.reduce((sum, p) => sum + p.pot, 0n),
    state: matchState(group),
  }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/markets.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
cd app && npx tsc --noEmit && cd ..
git add app/lib/markets.ts tests/markets.test.ts
git commit -m "feat: market catalogue and Fixture grouping for Matches"
```

---

### Task 2: find-or-open, the duplicate-Pool race handler

This is the highest-risk logic in the change. `line_x2` is **not** in the Pool PDA seeds (`lib.rs:346-360`) — only `nonce` is. Two people backing the same empty market at once both call `freeNonce`, both get the same nonce, one transaction fails, and a naive retry increments the nonce and creates a **second Pool on the same line**, silently splitting the pot.

**Files:**
- Create: `app/lib/openMarket.ts`
- Test: `tests/open-market.test.ts`

**Interfaces:**
- Consumes: `groupByFixture` is NOT used here. Uses `PoolAccount`, `PoolTypeName` from `anchorClient.ts`, `recordFixture` from `groups.ts`, `Fixture` from `fixtures.ts`.
- Produces: `findOrOpenPool(deps: OpenDeps): Promise<{ pool: PublicKey; created: boolean }>` where

```ts
interface OpenDeps {
  client: MarketClient;
  group: PublicKey;
  fixture: Fixture;
  poolType: PoolTypeName;
  lineX2: number;
  kickoffTs: number;
  getAccessToken: () => Promise<string | null>;
}
interface MarketClient {
  listPools(group?: PublicKey): Promise<PoolAccount[]>;
  freeNonce(group: PublicKey, fixtureId: bigint, poolType: PoolTypeName): Promise<bigint>;
  createPool(group: PublicKey, fixtureId: bigint, nonce: bigint, kickoffTs: number, poolType: PoolTypeName, lineX2: number): Promise<PublicKey>;
}
```

- [ ] **Step 1: Write the failing test**

Create `tests/open-market.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { findOrOpenPool } from "../app/lib/openMarket.js";

const G = new PublicKey("11111111111111111111111111111111");
const EXISTING = PublicKey.unique();
const fixture = { fixtureId: 1002n, home: "France", away: "England", kickoff: 1784408400, referenceProbabilities: [0, 0, 0] } as never;

function poolRow(over: Record<string, unknown> = {}) {
  return { address: EXISTING, group: G, fixtureId: 1002n, poolType: "totalGoals", lineX2: 5, ...over } as never;
}

function deps(over: Record<string, unknown> = {}) {
  return {
    client: {
      listPools: vi.fn().mockResolvedValue([]),
      freeNonce: vi.fn().mockResolvedValue(0n),
      createPool: vi.fn().mockResolvedValue(PublicKey.unique()),
    },
    group: G,
    fixture,
    poolType: "totalGoals",
    lineX2: 5,
    kickoffTs: 1784408400,
    getAccessToken: vi.fn().mockResolvedValue(null),
    ...over,
  } as never;
}

describe("findOrOpenPool", () => {
  it("joins an existing Pool on the same market and line instead of creating one", async () => {
    const d = deps({
      client: {
        listPools: vi.fn().mockResolvedValue([poolRow()]),
        freeNonce: vi.fn(),
        createPool: vi.fn(),
      },
    });
    const out = await findOrOpenPool(d);
    expect(out).toEqual({ pool: EXISTING, created: false });
    expect(d.client.createPool).not.toHaveBeenCalled();
  });

  it("does not join a Pool at a different line", async () => {
    const d = deps({
      client: {
        listPools: vi.fn().mockResolvedValue([poolRow({ lineX2: 7 })]),
        freeNonce: vi.fn().mockResolvedValue(0n),
        createPool: vi.fn().mockResolvedValue(PublicKey.unique()),
      },
    });
    const out = await findOrOpenPool(d);
    expect(out.created).toBe(true);
  });

  it("creates the Pool when the market is unopened", async () => {
    const d = deps();
    const out = await findOrOpenPool(d);
    expect(out.created).toBe(true);
    expect(d.client.createPool).toHaveBeenCalledWith(G, 1002n, 0n, 1784408400, "totalGoals", 5);
  });

  // THE RACE. Someone else won the nonce between our scan and our create.
  it("re-scans and JOINS rather than creating a duplicate when create loses the race", async () => {
    const listPools = vi
      .fn()
      .mockResolvedValueOnce([])            // our first scan: nothing there
      .mockResolvedValueOnce([poolRow()]);  // after the failure: the winner's Pool exists
    const d = deps({
      client: {
        listPools,
        freeNonce: vi.fn().mockResolvedValue(0n),
        createPool: vi.fn().mockRejectedValue(new Error("Allocate: account Address { .. } already in use")),
      },
    });
    const out = await findOrOpenPool(d);
    expect(out).toEqual({ pool: EXISTING, created: false });
    expect(d.client.createPool).toHaveBeenCalledTimes(1); // never retried into a duplicate
  });

  it("rethrows a create failure that is not the race", async () => {
    const d = deps({
      client: {
        listPools: vi.fn().mockResolvedValue([]),
        freeNonce: vi.fn().mockResolvedValue(0n),
        createPool: vi.fn().mockRejectedValue(new Error("insufficient funds for rent")),
      },
    });
    await expect(findOrOpenPool(d)).rejects.toThrow("insufficient funds");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/open-market.test.ts`
Expected: FAIL — `Failed to resolve import "../app/lib/openMarket.js"`.

- [ ] **Step 3: Write the implementation**

Create `app/lib/openMarket.ts`:

```ts
import type { PublicKey } from "@solana/web3.js";
import type { PoolAccount, PoolTypeName } from "./anchorClient";
import type { Fixture } from "./fixtures";
import { recordFixture } from "./groups";

/** Only the client surface this needs — keeps the race testable without a chain. */
export interface MarketClient {
  listPools(group?: PublicKey): Promise<PoolAccount[]>;
  freeNonce(group: PublicKey, fixtureId: bigint, poolType: PoolTypeName): Promise<bigint>;
  createPool(
    group: PublicKey, fixtureId: bigint, nonce: bigint, kickoffTs: number,
    poolType: PoolTypeName, lineX2: number,
  ): Promise<PublicKey>;
}

export interface OpenDeps {
  client: MarketClient;
  group: PublicKey;
  fixture: Fixture;
  poolType: PoolTypeName;
  lineX2: number;
  kickoffTs: number;
  getAccessToken: () => Promise<string | null>;
}

/** Anchor's error when the PDA we tried to allocate already exists — i.e. we lost the race. */
function isAlreadyInUse(e: unknown): boolean {
  return e instanceof Error && /already in use/i.test(e.message);
}

function match(p: PoolAccount, d: OpenDeps): boolean {
  return (
    p.group.equals(d.group) &&
    p.fixtureId === d.fixture.fixtureId &&
    p.poolType === d.poolType &&
    p.lineX2 === d.lineX2
  );
}

/**
 * Get the Pool for one market on one Fixture, creating it only if nobody has yet.
 *
 * `line_x2` is NOT in the Pool PDA seeds (lib.rs:346-360) — only `nonce` is — so the same
 * market and line can exist at several addresses. If two people open a market at once, both
 * take the same free nonce and one create fails. Retrying with nonce+1 would create a SECOND
 * Pool on the same line and silently split the pot, so on that specific failure we re-scan
 * and join the winner instead.
 */
export async function findOrOpenPool(d: OpenDeps): Promise<{ pool: PublicKey; created: boolean }> {
  const existing = (await d.client.listPools(d.group)).find((p) => match(p, d));
  if (existing) return { pool: existing.address, created: false };

  const nonce = await d.client.freeNonce(d.group, d.fixture.fixtureId, d.poolType);
  let pool: PublicKey;
  try {
    pool = await d.client.createPool(
      d.group, d.fixture.fixtureId, nonce, d.kickoffTs, d.poolType, d.lineX2,
    );
  } catch (e) {
    if (!isAlreadyInUse(e)) throw e;
    const winner = (await d.client.listPools(d.group)).find((p) => match(p, d));
    if (!winner) throw e; // lost the race to something we still can't see — surface it
    return { pool: winner.address, created: false };
  }

  // The Fixture name book. TxLINE's snapshot lists UPCOMING fixtures only, so once a match
  // kicks off its team names are unrecoverable and every Proof Receipt degrades to "Away win".
  // This is the last moment the Fixture is guaranteed resolvable. Best-effort by design: a
  // Pool that exists on-chain must never fail on a social-layer write.
  void d
    .getAccessToken()
    .then((t) => (t ? recordFixture(t, d.fixture) : null))
    .catch(() => {});

  return { pool, created: true };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/open-market.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
cd app && npx tsc --noEmit && cd ..
git add app/lib/openMarket.ts tests/open-market.test.ts
git commit -m "feat: find-or-open market Pool, collapsing the duplicate-line race into a join"
```

---

### Task 3: MatchCard and the Matches grid

**Files:**
- Create: `app/components/MatchCard.tsx`
- Modify: `app/components/PoolList.tsx`

**Interfaces:**
- Consumes: `Match`, `groupByFixture`, `marketLabel` from Task 1.
- Produces: `<MatchCard match={Match} onOpen={(m: Match) => void} />`

- [ ] **Step 1: Create MatchCard**

Create `app/components/MatchCard.tsx`:

```tsx
"use client";

import { fixtureById, teamFlag } from "@/lib/fixtures";
import { formatUsdc } from "@/lib/format";
import { marketLabel, type Match } from "@/lib/markets";

const STATE_LABEL: Record<Match["state"], string> = {
  open: "OPEN", locked: "LIVE", settled: "SETTLED", void: "VOID",
};

/** One Match in the grid: the fixture, what's riding on it across every market, and how many
 * markets are live. State always carries a text label, never colour alone (PRODUCT.md). */
export function MatchCard({ match, onOpen }: { match: Match; onOpen: (m: Match) => void }) {
  const fixture = fixtureById(match.fixtureId);
  const n = match.pools.length;

  return (
    <button className={`pool-card match-card ${match.state}`} onClick={() => onOpen(match)}>
      <div className="pc-head">
        <strong className="pc-teams">
          {fixture ? (
            <>
              <span aria-hidden="true">{teamFlag(fixture.home)}</span> {fixture.home}
              {" v "}
              <span aria-hidden="true">{teamFlag(fixture.away)}</span> {fixture.away}
            </>
          ) : (
            `Fixture ${match.fixtureId.toString()}`
          )}
        </strong>
        <span className={`badge ${match.state}`}>{STATE_LABEL[match.state]}</span>
      </div>

      <div className="pc-cells">
        <div className="pc-cell">
          <span className="label">Total pot</span>
          <span className="num">${formatUsdc(match.pot)}</span>
        </div>
        <div className="pc-cell">
          <span className="label">Markets</span>
          <span className="num">{n}</span>
        </div>
      </div>

      <ul className="match-markets">
        {match.pools.map((p) => (
          <li key={p.address.toBase58()}>
            <span>{marketLabel(p.poolType, p.lineX2)}</span>
            <span className="mono">${formatUsdc(p.pot)}</span>
          </li>
        ))}
      </ul>
    </button>
  );
}
```

- [ ] **Step 2: Point PoolList at Matches**

In `app/components/PoolList.tsx`, replace the `shown` derivation and the grid body. Add imports at the top:

```tsx
import { useRouter } from "next/navigation";
import { groupByFixture, type Match } from "@/lib/markets";
import { MatchCard } from "./MatchCard";
```

Replace the `shown` computation (currently `const shown = pools.filter(...)`) with:

```tsx
const router = useRouter();
const matches = groupByFixture(pools);
const shown = matches.filter((m) =>
  filter === "all" ? true : filter === "open" ? m.state === "open" : m.state === "settled",
);

function openMatch(m: Match) {
  router.push(`/match/${m.group.toBase58()}/${m.fixtureId.toString()}`);
}
```

Replace the contents of the `<div className="pool-grid">` block with:

```tsx
{shown.map((m) => (
  <MatchCard key={m.fixtureId.toString()} match={m} onOpen={openMatch} />
))}
```

Update the empty-state count, which previously read `pools.length`:

```tsx
Show all {matches.length}
```

- [ ] **Step 3: Add the card styles**

Append to `app/legacy.css`:

```css
/* A Match card lists its markets, so the fan sees the whole match, not one question. */
.match-markets { list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.match-markets li {
  display: flex; justify-content: space-between; gap: 10px;
  font-size: 12px; font-weight: 700;
  padding-top: 4px; border-top: 1px dashed rgba(31, 27, 16, 0.25);
}
.pc-teams { display: block; min-width: 0; overflow-wrap: anywhere; }
```

- [ ] **Step 4: Verify it compiles**

Run: `cd app && npx tsc --noEmit`
Expected: no errors in `PoolList.tsx` or `MatchCard.tsx`.

- [ ] **Step 5: Commit**

```bash
git add app/components/MatchCard.tsx app/components/PoolList.tsx app/legacy.css
git commit -m "feat: grid lists Matches with their markets instead of loose Pools"
```

---

### Task 4: MarketSection — one market, including the unopened state

**Files:**
- Create: `app/components/MarketSection.tsx`

**Interfaces:**
- Consumes: `MarketSpec`, `marketLabel` (Task 1); `findOrOpenPool` (Task 2).
- Produces:

```ts
<MarketSection
  spec={MarketSpec}
  lineX2={number}
  pool={PoolAccount | null}   // null = nobody has opened this market yet
  labels={string[]}
  myEntries={Record<number, bigint | undefined>}
  stake={bigint}
  busy={boolean}
  onBack={(poolType: PoolTypeName, lineX2: number, outcome: number) => Promise<void>}
/>
```

- [ ] **Step 1: Create the component**

Create `app/components/MarketSection.tsx`:

```tsx
"use client";

import type { PoolAccount, PoolTypeName } from "@/lib/anchorClient";
import { formatUsdc } from "@/lib/format";
import { marketLabel, type MarketSpec } from "@/lib/markets";

/**
 * One market on a Match. An unopened market is a first-class state, not an absence: the
 * market Pool is created lazily by whoever backs it first, so this renders the invitation
 * rather than hiding the market entirely.
 */
export function MarketSection({
  spec, lineX2, pool, labels, myEntries, stake, busy, onBack,
}: {
  spec: MarketSpec;
  lineX2: number;
  pool: PoolAccount | null;
  labels: string[];
  myEntries: Record<number, bigint | undefined>;
  stake: bigint;
  busy: boolean;
  onBack: (poolType: PoolTypeName, lineX2: number, outcome: number) => Promise<void>;
}) {
  const open = pool === null || pool.state === "open";

  return (
    <section className="market-section" aria-labelledby={`mkt-${spec.poolType}-${lineX2}`}>
      <div className="market-head">
        <h3 id={`mkt-${spec.poolType}-${lineX2}`} className="market-title">
          {marketLabel(spec.poolType, lineX2)}
        </h3>
        <span className="market-pot">
          {pool ? `$${formatUsdc(pool.pot)}` : "no money on it yet"}
        </span>
      </div>

      {!spec.hasOdds && (
        <p className="market-note">
          No crowd odds for this market — it settles from proven match stats.
        </p>
      )}

      <div className="outcome-grid">
        {labels.map((label, o) => {
          const mine = myEntries[o];
          return (
            <div key={o} className="outcome">
              <strong>{label}</strong>
              {pool && <span className="mono">${formatUsdc(pool.outcomeTotals[o] ?? 0n)}</span>}
              {mine && <span className="badge">You&rsquo;re in ${formatUsdc(mine)}</span>}
              <button
                disabled={busy || !open}
                onClick={() => onBack(spec.poolType, lineX2, o)}
              >
                Back ${formatUsdc(stake)}
              </button>
            </div>
          );
        })}
      </div>

      {pool === null && (
        <p className="market-note">Nobody has opened this market yet — back it to start it.</p>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Add styles**

Append to `app/legacy.css`:

```css
.market-section { border-top: 2px dashed rgba(31, 27, 16, 0.25); padding-top: 14px; margin-top: 14px; }
.market-section:first-of-type { border-top: 0; margin-top: 0; padding-top: 0; }
.market-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
.market-title { font-family: var(--display); font-size: 16px; font-weight: 800; text-transform: uppercase; margin: 0; }
.market-pot { font-family: var(--mono); font-size: 12px; font-weight: 700; color: var(--muted); }
.market-note { font-size: 12px; color: var(--muted); margin: 8px 0 0; }
```

- [ ] **Step 3: Verify it compiles**

Run: `cd app && npx tsc --noEmit`
Expected: no errors in `MarketSection.tsx`.

- [ ] **Step 4: Commit**

```bash
git add app/components/MarketSection.tsx app/legacy.css
git commit -m "feat: MarketSection renders one market, including the unopened state"
```

---

### Task 5: MatchView and the /match route

**Files:**
- Create: `app/components/MatchView.tsx`
- Create: `app/app/match/[group]/[fixture]/page.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1, 2, 4.
- Produces: `<MatchView group={PublicKey} fixtureId={bigint} />`

The Room uses channel `fixture:<group>:<fixtureId>` — one chat for the whole match.

- [ ] **Step 0: Extend the EXISTING MatchBanner instead of writing a second banner**

`app/components/MatchBanner.tsx` already exists and is already used by `PoolView.tsx:259` and
`SettledPool.tsx:65`. Do NOT write new banner markup — extend this one so it can also describe
a whole Match, where there is no single `poolType`/`lineX2`.

Change its props so the market chip is optional, and add a `markets` count for the Match case:

```tsx
export function MatchBanner({
  fixture, fixtureId, poolType, lineX2, state, pot, markets,
}: {
  fixture?: Fixture;
  fixtureId: bigint;
  /** Omitted on a Match banner — a Match spans several markets, so there is no single one. */
  poolType?: PoolTypeName;
  lineX2?: number;
  state: PoolState;
  /** Live rolling pot while Open; the final pot once Settled. */
  pot: bigint;
  /** Match banner only: how many markets are open on this Fixture. */
  markets?: number;
}) {
```

and replace the chip's contents with:

```tsx
<span className="chip-id">
  {poolType !== undefined
    ? poolTypeLabel(poolType, lineX2 ?? 0)
    : `${markets ?? 0} market${markets === 1 ? "" : "s"}`}
  {" · "}FX-{fixtureId.toString()}
</span>
```

Everything else in the file stays exactly as it is. `PoolView` and `SettledPool` keep passing
`poolType`/`lineX2` and are unaffected — verify with `npx tsc --noEmit`.

- [ ] **Step 1: Create MatchView**

Create `app/components/MatchView.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import type { PoolAccount, PoolTypeName } from "@/lib/anchorClient";
import { poolKickoffTs } from "@/lib/config";
import { friendlyError } from "@/lib/errors";
import { fixtureById, poolOutcomeLabels } from "@/lib/fixtures";
import { formatUsdc } from "@/lib/format";
import { MARKETS, groupByFixture } from "@/lib/markets";
import { findOrOpenPool } from "@/lib/openMarket";
import { useFinalWhistle } from "@/lib/useFinalWhistle";
import { useFixtures } from "@/lib/useTxlineLive";
import { MatchBanner } from "./MatchBanner";
import { MarketSection } from "./MarketSection";
import { Feed } from "./Feed";

export function MatchView({ group, fixtureId }: { group: PublicKey; fixtureId: bigint }) {
  const { client, getAccessToken } = useFinalWhistle();
  useFixtures();
  const [pools, setPools] = useState<PoolAccount[]>([]);
  const [stake, setStake] = useState(5_000_000n);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // My stake per (pool address -> outcome -> amount), so "You're in $X" survives the move off
  // PoolView. Failures resolve to empty rather than breaking the page.
  const [myEntries, setMyEntries] = useState<Record<string, Record<number, bigint | undefined>>>({});

  const load = useCallback(async () => {
    if (!client) return;
    const all = await client.listPools(group);
    const mine = all.filter((p) => p.fixtureId === fixtureId);
    setPools(mine);
    const entries: Record<string, Record<number, bigint | undefined>> = {};
    await Promise.all(
      mine.map(async (p) => {
        const outcomes = p.poolType === "matchWinner" ? [0, 1, 2] : [0, 1];
        const found: Record<number, bigint | undefined> = {};
        await Promise.all(
          outcomes.map(async (o) => {
            found[o] = (await client.fetchEntryAmount(p.address, o).catch(() => null)) ?? undefined;
          }),
        );
        entries[p.address.toBase58()] = found;
      }),
    );
    setMyEntries(entries);
  }, [client, group, fixtureId]);

  useEffect(() => {
    void load();
  }, [load]);

  const fixture = fixtureById(fixtureId);
  const match = groupByFixture(pools)[0];

  async function back(poolType: PoolTypeName, lineX2: number, outcome: number) {
    if (!client || !fixture) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    let opened = false;
    try {
      const { pool, created } = await findOrOpenPool({
        client, group, fixture, poolType, lineX2,
        kickoffTs: poolKickoffTs(fixture.kickoff), getAccessToken,
      });
      opened = created;
      await client.placeEntry(pool, outcome, stake);
      await load();
    } catch (e) {
      // If the market opened but the stake failed, the user has NOT been charged. Say so
      // plainly — the dangerous outcome is someone believing they hold a bet they don't.
      setError(
        opened
          ? `Market opened, but your $${formatUsdc(stake)} wasn't taken — try backing it again.`
          : friendlyError(e),
      );
      if (opened) await load();
    } finally {
      setBusy(false);
    }
  }

  if (!fixture) return <div className="panel muted">Loading Match…</div>;

  return (
    <div className="pool-layout">
      <div className="stack" style={{ gap: 0 }}>
        <MatchBanner
          fixture={fixture}
          fixtureId={fixtureId}
          state={match?.state ?? "open"}
          pot={match?.pot ?? 0n}
          markets={pools.length}
        />

        {error && <p className="error">{error}</p>}
        {notice && <p className="entry-note">{notice}</p>}

        <div className="panel stack">
          {MARKETS.flatMap((spec) => {
            const existing = pools.filter((p) => p.poolType === spec.poolType);
            // One section PER EXISTING POOL, not per distinct line. Two Pools can share a
            // (type, line) — `line_x2` isn't in the PDA seeds — and collapsing them by line
            // would hide the second one's money entirely. Money must never be invisible.
            if (existing.length === 0) {
              return [
                <MarketSection
                  key={`${spec.poolType}:new`}
                  spec={spec}
                  lineX2={spec.defaultLineX2}
                  pool={null}
                  labels={poolOutcomeLabels(spec.poolType, spec.defaultLineX2, fixture)}
                  myEntries={{}}
                  stake={stake}
                  busy={busy}
                  onBack={back}
                />,
              ];
            }
            return existing.map((pool) => (
              <MarketSection
                key={pool.address.toBase58()}
                spec={spec}
                lineX2={pool.lineX2}
                pool={pool}
                labels={poolOutcomeLabels(spec.poolType, pool.lineX2, fixture)}
                myEntries={myEntries[pool.address.toBase58()] ?? {}}
                stake={stake}
                busy={busy}
                onBack={back}
              />
            ));
          })}
        </div>

        <Feed feed={feed} me={displayName} myId={wallet ?? ""} />
      </div>
    </div>
  );
}
```

`Feed`'s API is unchanged — it takes `{ feed, me, myId }`. Wire the hook at the top of
`MatchView`, alongside the other hooks, exactly as `PoolView.tsx:45` does but with the
Fixture-scoped channel:

```tsx
import { useFeed } from "@/lib/useFeed";
import { useMyName } from "@/lib/useMyName";

// …inside MatchView, with the other hooks:
const { address: wallet } = useFinalWhistle();
const { name: displayName } = useMyName();
// One Room for the whole Match — not one per market.
const feed = useFeed(`fixture:${group.toBase58()}:${fixtureId.toString()}`, displayName, wallet);
```

**Note for the implementer:** confirm `useFeed`'s exact parameter order in
`app/lib/useFeed.ts` before writing this — copy it from the `PoolView.tsx:45` call site rather
than from memory.

- [ ] **Step 2: Create the route**

Create `app/app/match/[group]/[fixture]/page.tsx`:

```tsx
"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { PublicKey } from "@solana/web3.js";
import { BottomNav, NavBar } from "@/components/NavBar";
import { MatchView } from "@/components/MatchView";
import { useFinalWhistle } from "@/lib/useFinalWhistle";

export default function MatchPage({
  params,
}: {
  params: Promise<{ group: string; fixture: string }>;
}) {
  const { group, fixture } = use(params);
  const { authenticated, client } = useFinalWhistle();
  const router = useRouter();
  const goHome = (t: string) => router.push(`/?tab=${t}`);

  return (
    <>
      <NavBar onTab={goHome} />
      <div className="container">
        {!authenticated || !client ? (
          <div className="panel muted">Sign in to view this Match.</div>
        ) : (
          <MatchView group={new PublicKey(group)} fixtureId={BigInt(fixture)} />
        )}
      </div>
      <BottomNav onTab={goHome} />
    </>
  );
}
```

- [ ] **Step 3: Verify the route builds**

Run: `cd app && npm run build 2>&1 | grep -E "match|Compiled successfully"`
Expected: `Compiled successfully` and `/match/[group]/[fixture]` in the route manifest.

- [ ] **Step 4: Commit**

```bash
# MatchBanner is committed here because MatchView imports it — committing code that
# imports an untracked file would produce a broken tree. Commit ONLY these paths.
git add app/components/MatchBanner.tsx app/components/MatchView.tsx "app/app/match/[group]/[fixture]/page.tsx"
git commit -m "feat: Match page with markets inline and one Room per Fixture"
```

---

### Task 6: MatchReceipt — one proof, per-market results

All markets settle from the **same** TxLINE Score Proof: same score root, same Merkle path, same `ProvenStats`. Only `winning_outcome` differs. So there is one verification, not four.

**Files:**
- Create: `app/components/MatchReceipt.tsx`
- Modify: `app/components/MatchView.tsx`

**Interfaces:**
- Consumes: `ProofReceipt` (unchanged), `marketLabel`, `Match`.
- Produces: `<MatchReceipt match={Match} />`

- [ ] **Step 1: Create the component**

Create `app/components/MatchReceipt.tsx`:

```tsx
"use client";

import { fixtureById, poolOutcomeLabels } from "@/lib/fixtures";
import { formatUsdc } from "@/lib/format";
import { marketLabel, type Match } from "@/lib/markets";
import { ProofReceipt } from "./ProofReceipt";

/**
 * The Match's settlement. Every market settled from ONE Score Proof, so the verification
 * renders once (via ProofReceipt on any settled Pool) and each market contributes a result
 * row. Markets still settling are shown as pending — never implied to be proven.
 */
export function MatchReceipt({ match }: { match: Match }) {
  const fixture = fixtureById(match.fixtureId);
  const settled = match.pools.filter((p) => p.state === "settled");
  if (settled.length === 0) return null;

  return (
    <div className="stack" style={{ gap: 12 }}>
      <ProofReceipt
        address={settled[0].address.toBase58()}
        fixtureId={match.fixtureId}
        poolType={settled[0].poolType}
        lineX2={settled[0].lineX2}
      />

      <div className="panel">
        <h3 className="section-title">Every market on this Match</h3>
        <ul className="match-results">
          {match.pools.map((p) => {
            const labels = poolOutcomeLabels(p.poolType, p.lineX2, fixture);
            const result =
              p.state === "settled" && p.winningOutcome !== null
                ? labels[p.winningOutcome]
                : p.state === "void"
                  ? "Void — everyone refunded"
                  : "Still settling…";
            return (
              <li key={p.address.toBase58()}>
                <span>{marketLabel(p.poolType, p.lineX2)}</span>
                <strong>{result}</strong>
                <span className="mono">${formatUsdc(p.pot)}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add styles**

Append to `app/legacy.css`:

```css
.match-results { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.match-results li {
  display: grid; grid-template-columns: 1fr auto auto; gap: 12px; align-items: baseline;
  font-size: 13px; padding-bottom: 6px; border-bottom: 1px dashed rgba(31, 27, 16, 0.25);
}
.match-results li:last-child { border-bottom: 0; padding-bottom: 0; }
```

- [ ] **Step 3: Render it from MatchView**

In `app/components/MatchView.tsx`, add the import:

```tsx
import { MatchReceipt } from "./MatchReceipt";
```

and render it directly above the markets panel:

```tsx
{match && <MatchReceipt match={match} />}
```

- [ ] **Step 4: Verify**

Run: `cd app && npx tsc --noEmit && npm run build 2>&1 | grep "Compiled successfully"`
Expected: clean typecheck, `Compiled successfully`.

- [ ] **Step 5: Commit**

```bash
git add app/components/MatchReceipt.tsx app/components/MatchView.tsx app/legacy.css
git commit -m "feat: one Proof Receipt per Match with per-market results"
```

---

### Task 7: Remove CreatePoolModal and route the game browser to Matches

This is the task that removes the "now pick a market" prompt. **`CreatePoolModal` is the only caller of `recordFixture`** — Task 2 already moved that call into `findOrOpenPool`, so deleting the modal is now safe. Verify that before deleting.

**Files:**
- Modify: `app/components/GameBrowser.tsx`
- Delete: `app/components/CreatePoolModal.tsx`

- [ ] **Step 1: Confirm recordFixture has a home before deleting its old one**

Run: `cd app && grep -rn "recordFixture" lib components`
Expected: hits in `lib/groups.ts` (definition), `lib/openMarket.ts` (Task 2), and `components/CreatePoolModal.tsx` (about to go). If `openMarket.ts` is missing, STOP and finish Task 2 — deleting the modal without it silently returns every future Proof Receipt to "Away win", with no error and no failing test.

- [ ] **Step 2: Point the browser at the Match page**

In `app/components/GameBrowser.tsx`, remove the `CreatePoolModal` import, the `picked` state, and the `<CreatePoolModal … />` element. Add:

```tsx
import { useRouter } from "next/navigation";
```

and inside the component:

```tsx
const router = useRouter();
```

Change the fixture button's handler from `onClick={() => setPicked(f)}` to:

```tsx
onClick={() => router.push(`/match/${group.toBase58()}/${f.fixtureId.toString()}`)}
```

`GameBrowser` already takes `{ group, onCreated }` (`GameBrowser.tsx:30`), so `group` is in scope. `onCreated` becomes unused once the modal is gone — remove it from the props type and from the call site in `app/app/page.tsx`.

- [ ] **Step 3: Delete the modal**

```bash
git rm app/components/CreatePoolModal.tsx
```

- [ ] **Step 4: Verify nothing references it**

Run: `cd app && grep -rn "CreatePoolModal" . --include=*.tsx --include=*.ts | grep -v node_modules`
Expected: no output.

- [ ] **Step 5: Full verification**

```bash
cd app && npx tsc --noEmit && npm run build 2>&1 | grep "Compiled successfully"
cd .. && npx vitest run
```
Expected: clean typecheck, `Compiled successfully`, and all tests pass (109 existing + 14 new from Tasks 1-2).

- [ ] **Step 6: Commit**

The working tree carries unrelated in-flight work (DepositModal, Avatars, useCountUp and
others). NEVER use `git add -A` or `git add .` in this repo — stage only these paths:

```bash
git add app/components/GameBrowser.tsx app/app/page.tsx
git rm --cached app/components/CreatePoolModal.tsx 2>/dev/null || true
git commit -m "feat: browse straight to a Match; drop the pick-a-market prompt"
```

---

## Manual verification

Automated tests cover the pure logic; these paths need a browser.

1. **Grid** — a Group with Pools on two Fixtures shows two Match cards, each listing its markets, with pots summed correctly.
2. **Lazy open** — back an unopened market. Two wallet prompts (create, then enter). The market then shows your stake and a real pot.
3. **Join, don't duplicate** — back the *same* market and line from a second account. Only ONE Pool should exist for that (type, line): confirm the pot accumulates rather than a second row appearing.
4. **Partial failure** — reject the second wallet prompt. The message must say the money was not taken, and the market must render as open-with-$0, not "be first to back".
5. **One Room** — messages posted from the Match page appear once, for the whole match, not per market.
6. **Settled Match** — one Proof Receipt with the "Verified in your browser" banner, plus a result row per market. Team names must render (this exercises the moved `recordFixture`).
7. **Old links still work** — `/pool/<address>` and `/receipt/<address>` still load.
