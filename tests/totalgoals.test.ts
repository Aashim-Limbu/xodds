import { Keypair, PublicKey } from "@solana/web3.js";
import { beforeAll, describe, expect, it } from "vitest";
import { setUnixTimestamp } from "./helpers/clock.js";
import { claimPayout, createPool, fundedSigner, lockPool, makeUser, placeEntry, settlePool } from "./helpers/pool.js";
import { bootHarness, type Harness } from "./helpers/svm.js";
import { createUsdcMint, tokenBalance } from "./helpers/token.js";
import { buildScoreProof, type FixtureStats, publishScoresRoot } from "./helpers/txline.js";

// Total Goals O/U: Outcome 0 = Over, 1 = Under. Line 2.5 -> line_x2 = 5.
const LINE_2_5 = 5;

describe("Pool Type: Total Goals O/U", () => {
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
    await setUnixTimestamp(h.context, Number(kickoff));
  });

  function stats(fixtureId: bigint, home: number, away: number): FixtureStats {
    return { fixtureId, homeGoals: home, awayGoals: away, homeCorners: 4, awayCorners: 3, homeCards: 2, awayCards: 1 };
  }

  /** Create a Total Goals O/U Pool (Line 2.5), place `entries`, and Lock it. */
  async function lockedOU(fixtureId: bigint, entries: Array<{ outcome: number; amount: bigint }>) {
    const { pool, escrow } = await createPool(h, {
      group,
      mint,
      fixtureId,
      nonce: 0n,
      kickoff,
      poolType: "totalGoals",
      lineX2: LINE_2_5,
    });
    const users = [];
    for (const e of entries) {
      const { user, ata } = await makeUser(h, mint, e.amount);
      await placeEntry(h, { pool, escrow, user, userAta: ata, outcome: e.outcome, amount: e.amount });
      users.push({ user, ata, outcome: e.outcome });
    }
    await lockPool(h, pool, await fundedSigner(h));
    return { pool, escrow, users };
  }

  async function settleWith(pool: PublicKey, fixtureId: bigint, home: number, away: number) {
    const { root, proof } = buildScoreProof(stats(fixtureId, home, away), [decoy]);
    const scoresRoot = publishScoresRoot(h.context, root);
    await settlePool(h, { pool, scoresRoot, proof, signer: await fundedSigner(h) });
  }

  it("settles Over (Outcome 0) when total goals exceed the Line", async () => {
    // 2-1 = 3 goals > 2.5 -> Over wins.
    const { pool } = await lockedOU(70n, [
      { outcome: 0, amount: 100_000n },
      { outcome: 1, amount: 100_000n },
    ]);
    await settleWith(pool, 70n, 2, 1);

    const acct = await h.program.account.pool.fetch(pool);
    expect(acct.state).toEqual({ settled: {} });
    expect(acct.winningOutcome).toBe(0); // Over
    expect(acct.proven.homeGoals + acct.proven.awayGoals).toBe(3);
  });

  it("settles Under (Outcome 1) when total goals fall short of the Line", async () => {
    // 2-0 = 2 goals < 2.5 -> Under wins.
    const { pool } = await lockedOU(71n, [
      { outcome: 0, amount: 100_000n },
      { outcome: 1, amount: 100_000n },
    ]);
    await settleWith(pool, 71n, 2, 0);

    const acct = await h.program.account.pool.fetch(pool);
    expect(acct.winningOutcome).toBe(1); // Under
  });

  it("pays the winning O/U side its parimutuel share", async () => {
    // Over (2 backers, different sizes) vs Under; 2-1 -> Over wins the whole pot.
    const { pool, escrow } = await createPool(h, {
      group, mint, fixtureId: 72n, nonce: 0n, kickoff, poolType: "totalGoals", lineX2: LINE_2_5,
    });
    const over1 = await makeUser(h, mint, 100_000n);
    const under = await makeUser(h, mint, 200_000n);
    await placeEntry(h, { pool, escrow, user: over1.user, userAta: over1.ata, outcome: 0, amount: 100_000n });
    await placeEntry(h, { pool, escrow, user: under.user, userAta: under.ata, outcome: 1, amount: 200_000n });
    await lockPool(h, pool, await fundedSigner(h));
    await settleWith(pool, 72n, 3, 0); // 3 goals -> Over

    // Over backer is the only winner -> takes the whole 300k pot.
    await claimPayout(h, { pool, escrow, user: over1.user, userAta: over1.ata, outcome: 0 });
    expect(await tokenBalance(h.context, over1.ata)).toBe(300_000n);
  });

  it("rejects a whole-number Line (must be a half-integer, no push)", async () => {
    await expect(
      createPool(h, { group, mint, fixtureId: 73n, nonce: 0n, kickoff, poolType: "totalGoals", lineX2: 6 }),
    ).rejects.toThrow(/InvalidLine/);
  });

  it("rejects an Entry on a third Outcome (O/U has only two)", async () => {
    const { pool, escrow } = await createPool(h, {
      group, mint, fixtureId: 74n, nonce: 0n, kickoff, poolType: "totalGoals", lineX2: LINE_2_5,
    });
    const { user, ata } = await makeUser(h, mint, 100_000n);
    await expect(
      placeEntry(h, { pool, escrow, user, userAta: ata, outcome: 2, amount: 100_000n }),
    ).rejects.toThrow(/InvalidOutcome/);
  });
});
