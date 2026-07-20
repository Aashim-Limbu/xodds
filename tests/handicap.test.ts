import { Keypair, PublicKey } from "@solana/web3.js";
import { beforeAll, describe, expect, it } from "vitest";
import { setUnixTimestamp } from "./helpers/clock.js";
import { createPool, fundedSigner, lockPool, makeUser, placeEntry, settlePool } from "./helpers/pool.js";
import { bootHarness, type Harness } from "./helpers/svm.js";
import { createUsdcMint } from "./helpers/token.js";
import { buildScoreProof, type FixtureStats, publishScoresRoot } from "./helpers/txline.js";

// Asian Handicap: Outcome 0 = home covers, 1 = away covers. The Line is HOME-relative and
// stored ×2, so home -0.5 is line_x2 = -1 and home +1.5 is line_x2 = 3.
//
// The sign convention is pinned to the live TxLINE feed (probe 2026-07-19, fixture 18257739):
// the feed quotes the Line against `part1`, and AH -0.5 on part1 reproduced the outright 1X2
// part1 price while AH 0 reproduced draw-no-bet. Getting this backwards pays the wrong team,
// so it is asserted here rather than trusted.
const HOME_MINUS_0_5 = -1;
const HOME_PLUS_1_5 = 3;

describe("Pool Type: Asian Handicap", () => {
  let h: Harness;
  let mint: PublicKey;
  const group = Keypair.generate().publicKey;
  const kickoff = 2_000_000_000n;
  const decoy: FixtureStats = {
    fixtureId: 950n,
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

  /** Create a Handicap Pool on `lineX2`, back both sides, and Lock it. */
  async function lockedAH(fixtureId: bigint, lineX2: number) {
    const { pool, escrow } = await createPool(h, {
      group, mint, fixtureId, nonce: 0n, kickoff, poolType: "handicap", lineX2,
    });
    for (const outcome of [0, 1]) {
      const { user, ata } = await makeUser(h, mint, 100_000n);
      await placeEntry(h, { pool, escrow, user, userAta: ata, outcome, amount: 100_000n });
    }
    await lockPool(h, pool, await fundedSigner(h));
    return pool;
  }

  async function settleWith(pool: PublicKey, fixtureId: bigint, home: number, away: number) {
    const { root, proof } = buildScoreProof(stats(fixtureId, home, away), [decoy]);
    const scoresRoot = publishScoresRoot(h.context, root);
    await settlePool(h, { pool, scoresRoot, proof, signer: await fundedSigner(h) });
  }

  async function winnerOf(fixtureId: bigint, lineX2: number, home: number, away: number) {
    const pool = await lockedAH(fixtureId, lineX2);
    await settleWith(pool, fixtureId, home, away);
    return (await h.program.account.pool.fetch(pool)).winningOutcome;
  }

  it("home -0.5 covers when home wins by one", async () => {
    // 1-0: margin +1, less the 0.5 handicap, still positive -> home covers.
    expect(await winnerOf(80n, HOME_MINUS_0_5, 1, 0)).toBe(0);
  });

  it("home -0.5 does NOT cover a draw", async () => {
    // 1-1: margin 0, less the 0.5 handicap -> away covers. A -0.5 handicap is exactly
    // "home to win outright", so a draw must pay the away side.
    expect(await winnerOf(81n, HOME_MINUS_0_5, 1, 1)).toBe(1);
  });

  it("home -0.5 does NOT cover a home loss", async () => {
    expect(await winnerOf(82n, HOME_MINUS_0_5, 0, 2)).toBe(1);
  });

  it("home +1.5 covers a one-goal defeat", async () => {
    // 0-1: margin -1, plus the 1.5 handicap, positive -> home covers. This is the case that
    // catches an inverted sign: the losing side wins the bet.
    expect(await winnerOf(83n, HOME_PLUS_1_5, 0, 1)).toBe(0);
  });

  it("home +1.5 does NOT cover a two-goal defeat", async () => {
    // 0-2: margin -2, plus 1.5, still negative -> away covers.
    expect(await winnerOf(84n, HOME_PLUS_1_5, 0, 2)).toBe(1);
  });

  it("rejects a whole-number Line, which could push", async () => {
    // A level (0) or whole (-1) handicap ties on the matching margin, and the program has no
    // per-Entry refund — so it must be impossible to create one at all.
    for (const lineX2 of [0, -2, 2]) {
      await expect(
        createPool(h, { group, mint, fixtureId: 85n, nonce: 0n, kickoff, poolType: "handicap", lineX2 }),
      ).rejects.toThrow(/InvalidLine/);
    }
  });

  it("rejects an Entry on a third Outcome (Handicap has only two)", async () => {
    const { pool, escrow } = await createPool(h, {
      group, mint, fixtureId: 86n, nonce: 0n, kickoff, poolType: "handicap", lineX2: HOME_MINUS_0_5,
    });
    const { user, ata } = await makeUser(h, mint, 100_000n);
    await expect(
      placeEntry(h, { pool, escrow, user, userAta: ata, outcome: 2, amount: 100_000n }),
    ).rejects.toThrow(/InvalidOutcome/);
  });
});
