import { Keypair, PublicKey } from "@solana/web3.js";
import { beforeAll, describe, expect, it } from "vitest";
import { setUnixTimestamp } from "./helpers/clock.js";
import {
  claimPayout,
  createPool,
  fundedSigner,
  lockPool,
  makeUser,
  placeEntry,
  settlePool,
} from "./helpers/pool.js";
import { bootHarness, type Harness } from "./helpers/svm.js";
import { createUsdcMint, tokenBalance } from "./helpers/token.js";
import { buildScoreProof, type FixtureStats, publishScoresRoot } from "./helpers/txline.js";

describe("Pool: parimutuel payout claim", () => {
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

  /** Settle `fixtureId` as a home win (Outcome 0) after the given Entries are placed. */
  async function settledHomeWin(fixtureId: bigint, entries: Array<{ outcome: number; amount: bigint }>) {
    const { pool, escrow } = await createPool(h, { group, mint, fixtureId, nonce: 0n, kickoff });
    const users = [];
    for (const e of entries) {
      const { user, ata } = await makeUser(h, mint, e.amount); // funded with exactly the stake
      await placeEntry(h, { pool, escrow, user, userAta: ata, outcome: e.outcome, amount: e.amount });
      users.push({ user, ata, outcome: e.outcome, amount: e.amount });
    }
    await lockPool(h, pool, await fundedSigner(h));
    const stats: FixtureStats = {
      fixtureId,
      homeGoals: 2,
      awayGoals: 1,
      homeCorners: 4,
      awayCorners: 3,
      homeCards: 2,
      awayCards: 1,
    }; // 2-1 -> Outcome 0 wins
    const { root, proof } = buildScoreProof(stats, [decoy]);
    const scoresRoot = publishScoresRoot(h.context, root);
    await settlePool(h, { pool, scoresRoot, proof, signer: await fundedSigner(h) });
    return { pool, escrow, users };
  }

  it("splits the pot by Entry ratio, rounds down, and leaves dust in escrow", async () => {
    // pot = 4_000_000; winning (Outcome 0) total = 3_000_000.
    //   A: 1_000_000 -> 1_000_000 * 4_000_000 / 3_000_000 = 1_333_333 (dust 1/3)
    //   B: 2_000_000 -> 2_000_000 * 4_000_000 / 3_000_000 = 2_666_666 (dust 2/3)
    // sum of payouts = 3_999_999; dust = 1 stays in escrow.
    const pot = 4_000_000n;
    const { pool, escrow, users } = await settledHomeWin(50n, [
      { outcome: 0, amount: 1_000_000n },
      { outcome: 0, amount: 2_000_000n },
      { outcome: 1, amount: 1_000_000n }, // loser
    ]);
    const [a, b, loser] = users;

    await claimPayout(h, { pool, escrow, user: a.user, userAta: a.ata, outcome: 0 });
    await claimPayout(h, { pool, escrow, user: b.user, userAta: b.ata, outcome: 0 });

    const aPayout = await tokenBalance(h.context, a.ata);
    const bPayout = await tokenBalance(h.context, b.ata);
    const dust = await tokenBalance(h.context, escrow);

    // Ratio: B staked 2x A, so B's payout is 2x A's (both floored).
    expect(aPayout).toBe(1_333_333n);
    expect(bPayout).toBe(2_666_666n);
    expect(await tokenBalance(h.context, loser.ata)).toBe(0n); // loser gets nothing
    // Solvency (ADR-0003): payouts + remaining dust exactly account for the pot; the
    // escrow never overpays. Derived from observed balances, not hardcoded literals.
    expect(aPayout + bPayout + dust).toBe(pot);
    expect(dust).toBe(1n);
  });

  it("pays a losing Entry nothing (claim on a losing Outcome is rejected)", async () => {
    const { pool, escrow, users } = await settledHomeWin(51n, [
      { outcome: 0, amount: 500_000n },
      { outcome: 1, amount: 500_000n }, // loser on Outcome 1
    ]);
    const loser = users[1];

    await expect(
      claimPayout(h, { pool, escrow, user: loser.user, userAta: loser.ata, outcome: 1 }),
    ).rejects.toThrow(/NotWinningOutcome/);
    expect(await tokenBalance(h.context, loser.ata)).toBe(0n);
  });

  it("rejects a claim from a User with no Entry on the winning Outcome", async () => {
    const { pool, escrow, users } = await settledHomeWin(52n, [
      { outcome: 0, amount: 500_000n },
      { outcome: 1, amount: 500_000n },
    ]);
    const loser = users[1]; // has an Entry on Outcome 1, none on the winning Outcome 0

    // The winning-Outcome Entry PDA does not exist, so the claim reverts; the User is
    // paid nothing. (The exact account-validation error string varies with bankrun's
    // closed-account GC, so we assert the invariant, not the message.)
    await expect(
      claimPayout(h, { pool, escrow, user: loser.user, userAta: loser.ata, outcome: 0 }),
    ).rejects.toThrow();
    expect(await tokenBalance(h.context, loser.ata)).toBe(0n);
  });

  it("lets a winning Entry be claimed only once", async () => {
    const { pool, escrow, users } = await settledHomeWin(53n, [{ outcome: 0, amount: 1_000_000n }]);
    const a = users[0];

    await claimPayout(h, { pool, escrow, user: a.user, userAta: a.ata, outcome: 0 });
    const afterFirst = await tokenBalance(h.context, a.ata);

    // The Entry is closed on the first claim, so the second reverts and pays nothing more.
    await expect(
      claimPayout(h, { pool, escrow, user: a.user, userAta: a.ata, outcome: 0 }),
    ).rejects.toThrow();
    expect(await tokenBalance(h.context, a.ata)).toBe(afterFirst);
  });

  it("refuses to claim from a Pool that is not Settled", async () => {
    const { pool, escrow } = await createPool(h, { group, mint, fixtureId: 54n, nonce: 0n, kickoff });
    const { user, ata } = await makeUser(h, mint, 1_000_000n);
    await placeEntry(h, { pool, escrow, user, userAta: ata, outcome: 0, amount: 1_000_000n });
    await lockPool(h, pool, await fundedSigner(h)); // Locked, never Settled

    await expect(
      claimPayout(h, { pool, escrow, user, userAta: ata, outcome: 0 }),
    ).rejects.toThrow(/PoolNotSettled/);
  });
});
