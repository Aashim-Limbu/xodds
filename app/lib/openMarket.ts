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
  if (!(e instanceof Error)) return false;
  const raw = (e as { logs?: unknown }).logs;
  const logs = Array.isArray(raw) ? raw.join(" ") : "";
  return /already in use/i.test(`${e.message} ${logs}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    // The create failed atomically, so nothing was charged. Give the RPC a slot to catch up —
    // an immediate re-read often misses a Pool that just confirmed — before giving up.
    let winner = (await d.client.listPools(d.group)).find((p) => match(p, d));
    if (!winner) {
      await sleep(400);
      winner = (await d.client.listPools(d.group)).find((p) => match(p, d));
    }
    if (!winner) {
      throw new Error(
        "Couldn't open this market — no money was taken. Please try again.",
        { cause: e },
      );
    }
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
