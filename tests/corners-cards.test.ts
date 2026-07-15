import { Keypair, PublicKey } from "@solana/web3.js";
import { beforeAll, describe, expect, it } from "vitest";
import { setUnixTimestamp } from "./helpers/clock.js";
import { claimPayout, createPool, fundedSigner, lockPool, makeUser, placeEntry, settlePool } from "./helpers/pool.js";
import { bootHarness, type Harness } from "./helpers/svm.js";
import { createUsdcMint, tokenBalance } from "./helpers/token.js";
import { buildScoreProof, type FixtureStats, publishScoresRoot } from "./helpers/txline.js";

// Total Corners / Total Cards O/U (CONTEXT.md MVP Pool Types): Outcome 0 = Over, 1 = Under.
// Same O/U predicate as Total Goals, on the corners/cards leaf stats the proof already carries.

const USDC = 1_000_000n;

describe("Pool Types: Total Corners / Total Cards O/U", () => {
  let h: Harness;
  let mint: PublicKey;
  const group = Keypair.generate().publicKey;
  const kickoff = 2_000_000_000n;
  const decoy: FixtureStats = { fixtureId: 900n, homeGoals: 0, awayGoals: 0, homeCorners: 1, awayCorners: 1, homeCards: 0, awayCards: 0 };

  beforeAll(async () => {
    h = await bootHarness();
    mint = await createUsdcMint(h.context);
    await setUnixTimestamp(h.context, Number(kickoff));
  });

  async function run(
    poolType: "totalCorners" | "totalCards",
    fixtureId: bigint,
    lineX2: number,
    stats: FixtureStats,
    expectWinner: number,
  ) {
    const { pool, escrow } = await createPool(h, { group, mint, fixtureId, nonce: 0n, kickoff, poolType, lineX2 });
    const over = await makeUser(h, mint, 5n * USDC);
    const under = await makeUser(h, mint, 5n * USDC);
    await placeEntry(h, { pool, escrow, user: over.user, userAta: over.ata, outcome: 0, amount: 5n * USDC });
    await placeEntry(h, { pool, escrow, user: under.user, userAta: under.ata, outcome: 1, amount: 5n * USDC });
    await lockPool(h, pool, await fundedSigner(h));
    const { root, proof } = buildScoreProof(stats, [decoy]);
    const scoresRoot = publishScoresRoot(h.context, root);
    await settlePool(h, { pool, scoresRoot, proof, signer: await fundedSigner(h) });
    const acct = await h.program.account.pool.fetch(pool);
    expect(acct.winningOutcome).toBe(expectWinner);
    // Winner takes the pot.
    const winner = expectWinner === 0 ? over : under;
    await claimPayout(h, { pool, escrow, user: winner.user, userAta: winner.ata, outcome: expectWinner });
    expect(await tokenBalance(h.context, winner.ata)).toBe(10n * USDC);
  }

  const base = { homeGoals: 1, awayGoals: 1, homeCards: 2, awayCards: 1 };

  it("Total Corners: 10 corners over a 9.5 Line -> Over wins", async () => {
    await run("totalCorners", 7101n, 19, { fixtureId: 7101n, ...base, homeCorners: 6, awayCorners: 4 }, 0);
  });

  it("Total Corners: 9 corners under a 9.5 Line -> Under wins", async () => {
    await run("totalCorners", 7102n, 19, { fixtureId: 7102n, ...base, homeCorners: 5, awayCorners: 4 }, 1);
  });

  it("Total Cards: 5 cards over a 4.5 Line -> Over wins", async () => {
    await run("totalCards", 7103n, 9, { fixtureId: 7103n, ...base, homeCorners: 4, awayCorners: 4, homeCards: 3, awayCards: 2 }, 0);
  });

  it("Total Cards: 3 cards under a 4.5 Line -> Under wins", async () => {
    await run("totalCards", 7104n, 9, { fixtureId: 7104n, ...base, homeCorners: 4, awayCorners: 4, homeCards: 2, awayCards: 1 }, 1);
  });

  it("rejects an even Line (no push allowed)", async () => {
    await expect(
      createPool(h, { group, mint, fixtureId: 7105n, nonce: 0n, kickoff, poolType: "totalCorners", lineX2: 20 }),
    ).rejects.toThrow(/InvalidLine|6/);
  });
});
