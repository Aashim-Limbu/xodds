import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { beforeAll, describe, expect, it } from "vitest";
import { setUnixTimestamp } from "./helpers/clock.js";
import { createPool, fundedSigner, lockPool, makeUser, placeEntry, settlePool } from "./helpers/pool.js";
import { bootHarness, type Harness } from "./helpers/svm.js";
import { createUsdcMint } from "./helpers/token.js";
import { buildScoreProof, type FixtureStats, publishScoresRoot, STATUS_ABANDONED } from "./helpers/txline.js";

describe("Pool: settle by TxLINE Score Proof (trustless, permissionless, once)", () => {
  let h: Harness;
  let mint: PublicKey;
  const group = Keypair.generate().publicKey;
  const kickoff = 2_000_000_000n;

  // A couple of decoy Fixtures so the Merkle tree has real (non-trivial) siblings.
  const decoys: FixtureStats[] = [
    { fixtureId: 900n, homeGoals: 0, awayGoals: 0, homeCorners: 1, awayCorners: 1, homeCards: 0, awayCards: 0 },
    { fixtureId: 901n, homeGoals: 5, awayGoals: 5, homeCorners: 9, awayCorners: 2, homeCards: 3, awayCards: 1 },
  ];

  beforeAll(async () => {
    h = await bootHarness();
    mint = await createUsdcMint(h.context);
    await setUnixTimestamp(h.context, Number(kickoff)); // all Pools are past kickoff here
  });

  /** Create a Pool for `fixtureId`, place one Entry on each Outcome, and Lock it. */
  async function lockedPool(fixtureId: bigint) {
    const { pool, escrow } = await createPool(h, { group, mint, fixtureId, nonce: 0n, kickoff });
    for (const outcome of [0, 1, 2]) {
      const { user, ata } = await makeUser(h, mint, 1_000_000n);
      await placeEntry(h, { pool, escrow, user, userAta: ata, outcome, amount: 100_000n });
    }
    await lockPool(h, pool, await fundedSigner(h));
    return { pool, escrow };
  }

  function statsFor(fixtureId: bigint, home: number, away: number): FixtureStats {
    return { fixtureId, homeGoals: home, awayGoals: away, homeCorners: 4, awayCorners: 3, homeCards: 2, awayCards: 1 };
  }

  it("settles a Locked Pool, stores proven stats + root, and emits the Proof Receipt event", async () => {
    const fixtureId = 10n;
    const { pool } = await lockedPool(fixtureId);
    const { root, proof } = buildScoreProof(statsFor(fixtureId, 2, 1), decoys); // home win -> Outcome 0
    const scoresRoot = publishScoresRoot(h.context, root);

    await settlePool(h, { pool, scoresRoot, proof, signer: await fundedSigner(h) });

    const acct = await h.program.account.pool.fetch(pool);
    expect(acct.state).toEqual({ settled: {} });
    expect(acct.winningOutcome).toBe(0);
    expect(acct.proven.homeGoals).toBe(2);
    expect(acct.proven.awayGoals).toBe(1);
    expect(acct.proven.homeCorners).toBe(4);
    expect(acct.proven.awayCards).toBe(1);
    expect(Buffer.from(acct.scoreRoot)).toEqual(Buffer.from(root));
  });

  it.each([
    ["home win", 3, 1, 0],
    ["draw", 2, 2, 1],
    ["away win", 0, 2, 2],
  ] as const)("maps the 1X2 predicate: %s -> Outcome %d", async (_label, home, away, expected) => {
    const fixtureId = BigInt(20 + expected);
    const { pool } = await lockedPool(fixtureId);
    const { root, proof } = buildScoreProof(statsFor(fixtureId, home, away), decoys);
    const scoresRoot = publishScoresRoot(h.context, root);

    await settlePool(h, { pool, scoresRoot, proof, signer: await fundedSigner(h) });

    expect((await h.program.account.pool.fetch(pool)).winningOutcome).toBe(expected);
  });

  it("rejects a proof that does not verify against the root; the Pool stays Locked", async () => {
    const fixtureId = 30n;
    const { pool } = await lockedPool(fixtureId);
    const { root, proof } = buildScoreProof(statsFor(fixtureId, 2, 1), decoys);
    const scoresRoot = publishScoresRoot(h.context, root);

    // Tamper the proven stats so the recomputed leaf no longer matches the root.
    const forged = { ...proof, homeGoals: 4 };
    await expect(
      settlePool(h, { pool, scoresRoot, proof: forged, signer: await fundedSigner(h) }),
    ).rejects.toThrow(/ProofVerificationFailed/);

    expect((await h.program.account.pool.fetch(pool)).state).toEqual({ locked: {} });
  });

  it("rejects a root supplied from a non-TxLINE-owned account", async () => {
    const fixtureId = 31n;
    const { pool } = await lockedPool(fixtureId);
    const { root, proof } = buildScoreProof(statsFor(fixtureId, 2, 1), decoys);

    // Same root bytes, but the account is NOT owned by TXLINE_PROGRAM_ID.
    const fakeRootAccount = Keypair.generate().publicKey;
    h.context.setAccount(fakeRootAccount, {
      executable: false,
      owner: PublicKey.default,
      lamports: 1_000_000,
      data: Buffer.from(root),
      rentEpoch: 0,
    });

    await expect(
      settlePool(h, { pool, scoresRoot: fakeRootAccount, proof, signer: await fundedSigner(h) }),
    ).rejects.toThrow(/InvalidScoresRoot/);
    expect((await h.program.account.pool.fetch(pool)).state).toEqual({ locked: {} });
  });

  it("rejects an abandoned Fixture (routes to Void in a later ticket, not settle)", async () => {
    const fixtureId = 32n;
    const { pool } = await lockedPool(fixtureId);
    const abandoned = { ...statsFor(fixtureId, 0, 0), status: STATUS_ABANDONED };
    const { root, proof } = buildScoreProof(abandoned, decoys);
    const scoresRoot = publishScoresRoot(h.context, root);

    await expect(
      settlePool(h, { pool, scoresRoot, proof, signer: await fundedSigner(h) }),
    ).rejects.toThrow(/FixtureNotFinalised/);
  });

  it("refuses to settle a Pool that is not Locked (still Open)", async () => {
    const fixtureId = 33n;
    const { pool } = await createPool(h, { group, mint, fixtureId, nonce: 0n, kickoff }); // Open, never Locked
    const { root, proof } = buildScoreProof(statsFor(fixtureId, 1, 0), decoys);
    const scoresRoot = publishScoresRoot(h.context, root);

    await expect(
      settlePool(h, { pool, scoresRoot, proof, signer: await fundedSigner(h) }),
    ).rejects.toThrow(/PoolNotLocked/);
  });

  it("settles only once; a second settle fails", async () => {
    const fixtureId = 34n;
    const { pool } = await lockedPool(fixtureId);
    const { root, proof } = buildScoreProof(statsFor(fixtureId, 1, 0), decoys);
    const scoresRoot = publishScoresRoot(h.context, root);

    await settlePool(h, { pool, scoresRoot, proof, signer: await fundedSigner(h) });
    await expect(
      settlePool(h, { pool, scoresRoot, proof, signer: await fundedSigner(h) }),
    ).rejects.toThrow(/PoolNotLocked/);
  });

  it("verifies in-program well within the compute budget (ADR-0004: ~1.4M CU)", async () => {
    const fixtureId = 40n;
    const { pool } = await lockedPool(fixtureId);
    // A wider tree (deeper Merkle path) to stress the on-chain hash-walk.
    const manyDecoys: FixtureStats[] = Array.from({ length: 63 }, (_, i) => statsFor(BigInt(1000 + i), i % 4, i % 3));
    const { root, proof } = buildScoreProof(statsFor(fixtureId, 2, 0), manyDecoys);
    const scoresRoot = publishScoresRoot(h.context, root);
    const signer = await fundedSigner(h);

    const ix = await h.program.methods
      .settle(proof)
      .accountsPartial({ pool, scoresRoot, signer: signer.publicKey })
      .instruction();
    const tx = new Transaction().add(ix);
    tx.recentBlockhash = h.context.lastBlockhash;
    tx.feePayer = signer.publicKey;
    tx.sign(signer);
    const meta = await h.context.banksClient.processTransaction(tx);
    // Measured ~6k CU for a 6-deep Merkle path — ~230x under budget, so ADR-0004's
    // trusted-resolver fallback is not needed.
    expect(Number(meta.computeUnitsConsumed)).toBeLessThan(1_400_000);
    expect((await h.program.account.pool.fetch(pool)).winningOutcome).toBe(0);
  });
});
