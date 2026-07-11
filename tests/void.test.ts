import { Keypair, PublicKey } from "@solana/web3.js";
import { beforeAll, describe, expect, it } from "vitest";
import { setUnixTimestamp } from "./helpers/clock.js";
import {
  claimRefund,
  createPool,
  fundedSigner,
  lockPool,
  makeUser,
  placeEntry,
  settlePool,
  voidExpired,
} from "./helpers/pool.js";
import { bootHarness, type Harness } from "./helpers/svm.js";
import { createUsdcMint, tokenBalance } from "./helpers/token.js";
import { buildScoreProof, type FixtureStats, publishScoresRoot, STATUS_ABANDONED } from "./helpers/txline.js";

const GRACE = 21_600n; // 6h, must match GRACE_SECONDS on-chain

describe("Pool: Void + Refund (all three triggers close the solvency loop)", () => {
  let h: Harness;
  let mint: PublicKey;
  const group = Keypair.generate().publicKey;
  const kickoff = 2_000_000_000n;
  const decoy: FixtureStats = {
    fixtureId: 900n,
    homeGoals: 0,
    awayGoals: 0,
    homeCorners: 1,
    awayCorners: 1,
    homeCards: 0,
    awayCards: 0,
  };

  beforeAll(async () => {
    h = await bootHarness();
    mint = await createUsdcMint(h.context);
  });

  type Placed = { user: Keypair; ata: PublicKey; outcome: number; amount: bigint };

  /** Create a Pool, place `entries` (each User funded with exactly its stake), and Lock it. */
  async function lockedPool(fixtureId: bigint, entries: Array<{ outcome: number; amount: bigint }>) {
    const { pool, escrow } = await createPool(h, { group, mint, fixtureId, nonce: 0n, kickoff });
    const users: Placed[] = [];
    for (const e of entries) {
      const { user, ata } = await makeUser(h, mint, e.amount);
      await placeEntry(h, { pool, escrow, user, userAta: ata, outcome: e.outcome, amount: e.amount });
      users.push({ user, ata, outcome: e.outcome, amount: e.amount });
    }
    await setUnixTimestamp(h.context, Number(kickoff));
    await lockPool(h, pool, await fundedSigner(h));
    return { pool, escrow, users };
  }

  /** Settle `pool` with a proof for the given scoreline / status. */
  async function settleWith(pool: PublicKey, fixtureId: bigint, home: number, away: number, status?: number) {
    const stats: FixtureStats = {
      fixtureId,
      homeGoals: home,
      awayGoals: away,
      homeCorners: 4,
      awayCorners: 3,
      homeCards: 2,
      awayCards: 1,
      status,
    };
    const { root, proof } = buildScoreProof(stats, [decoy]);
    const scoresRoot = publishScoresRoot(h.context, root);
    await settlePool(h, { pool, scoresRoot, proof, signer: await fundedSigner(h) });
  }

  /** Every Entry refunds its full stake; escrow ends empty. */
  async function refundAllAndAssertEmpty(pool: PublicKey, escrow: PublicKey, users: Placed[]) {
    for (const u of users) {
      await claimRefund(h, { pool, escrow, user: u.user, userAta: u.ata, outcome: u.outcome });
      expect(await tokenBalance(h.context, u.ata)).toBe(u.amount); // full refund, no fee
    }
    expect(await tokenBalance(h.context, escrow)).toBe(0n);
  }

  it("Trigger 1: a proven winning Outcome with zero Entries Voids; all Entries refund in full", async () => {
    // Entries only on Outcomes 1 and 2; the proof says home win (Outcome 0) — zero-backed.
    const { pool, escrow, users } = await lockedPool(60n, [
      { outcome: 1, amount: 300_000n },
      { outcome: 2, amount: 200_000n },
    ]);
    await settleWith(pool, 60n, 2, 1); // home win -> Outcome 0, which has no Entries

    const acct = await h.program.account.pool.fetch(pool);
    expect(acct.state).toEqual({ void: {} });
    expect(acct.voidReason).toEqual({ noWinningEntries: {} });
    await refundAllAndAssertEmpty(pool, escrow, users);
  });

  it("Trigger 2: an abandoned Fixture Voids; all Entries refund in full", async () => {
    const { pool, escrow, users } = await lockedPool(61n, [
      { outcome: 0, amount: 100_000n },
      { outcome: 1, amount: 150_000n },
    ]);
    await settleWith(pool, 61n, 0, 0, STATUS_ABANDONED);

    const acct = await h.program.account.pool.fetch(pool);
    expect(acct.state).toEqual({ void: {} });
    expect(acct.voidReason).toEqual({ abandoned: {} });
    await refundAllAndAssertEmpty(pool, escrow, users);
  });

  it("Trigger 3: a Fixture that never finalises Voids after the grace window; all Entries refund", async () => {
    const { pool, escrow, users } = await lockedPool(62n, [
      { outcome: 0, amount: 100_000n },
      { outcome: 2, amount: 100_000n },
    ]);
    await setUnixTimestamp(h.context, Number(kickoff + GRACE)); // grace deadline reached

    await voidExpired(h, pool, await fundedSigner(h)); // permissionless

    const acct = await h.program.account.pool.fetch(pool);
    expect(acct.state).toEqual({ void: {} });
    expect(acct.voidReason).toEqual({ expired: {} });
    await refundAllAndAssertEmpty(pool, escrow, users);
  });

  it("refuses void_expired before the grace window elapses", async () => {
    const { pool } = await lockedPool(63n, [{ outcome: 0, amount: 100_000n }]);
    await setUnixTimestamp(h.context, Number(kickoff + GRACE - 100n)); // past kickoff, before grace

    await expect(voidExpired(h, pool, await fundedSigner(h))).rejects.toThrow(/GracePeriodNotElapsed/);
    expect((await h.program.account.pool.fetch(pool)).state).toEqual({ locked: {} });
  });

  it("refunds an Entry only once", async () => {
    const { pool, escrow, users } = await lockedPool(64n, [{ outcome: 0, amount: 100_000n }]);
    await setUnixTimestamp(h.context, Number(kickoff + GRACE));
    await voidExpired(h, pool, await fundedSigner(h));
    const [u] = users;

    await claimRefund(h, { pool, escrow, user: u.user, userAta: u.ata, outcome: u.outcome });
    const afterFirst = await tokenBalance(h.context, u.ata);
    // The Entry is closed on refund, so the second reverts and returns nothing more.
    await expect(
      claimRefund(h, { pool, escrow, user: u.user, userAta: u.ata, outcome: u.outcome }),
    ).rejects.toThrow();
    expect(await tokenBalance(h.context, u.ata)).toBe(afterFirst);
  });

  it("keeps Void terminal: no settle or re-void after Void, and no refund from a Settled Pool", async () => {
    // Void via expiry, then confirm the terminal guards.
    const { pool } = await lockedPool(65n, [{ outcome: 0, amount: 100_000n }]);
    await setUnixTimestamp(h.context, Number(kickoff + GRACE));
    await voidExpired(h, pool, await fundedSigner(h));

    await expect(settleWith(pool, 65n, 2, 1)).rejects.toThrow(/PoolNotLocked/); // no settle after Void
    await expect(voidExpired(h, pool, await fundedSigner(h))).rejects.toThrow(/PoolNotLocked/); // no double Void

    // A Settled (payable) Pool cannot be refunded.
    const settled = await lockedPool(66n, [{ outcome: 0, amount: 100_000n }]);
    await settleWith(settled.pool, 66n, 2, 1); // home win, Outcome 0 backed -> Settled
    const [u] = settled.users;
    await expect(
      claimRefund(h, { pool: settled.pool, escrow: settled.escrow, user: u.user, userAta: u.ata, outcome: u.outcome }),
    ).rejects.toThrow(/PoolNotVoid/);
  });
});
