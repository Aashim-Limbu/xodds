import { BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { beforeAll, describe, expect, it } from "vitest";
import { bootHarness, type Harness } from "./helpers/svm.js";
import { createUsdcMint, fundSol, fundUsdc, tokenBalance } from "./helpers/token.js";

// Match Winner (1X2): 0 = home win, 1 = draw, 2 = away win.
const MATCH_WINNER = { matchWinner: {} };

/** Derive the Pool PDA the program uses: [b"pool", group, fixture_id, pool_type=0, nonce]. */
function poolPda(program: Harness["program"], group: PublicKey, fixtureId: bigint, nonce: bigint) {
  const fixtureBuf = Buffer.alloc(8);
  fixtureBuf.writeBigUInt64LE(fixtureId);
  const nonceBuf = Buffer.alloc(8);
  nonceBuf.writeBigUInt64LE(nonce);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), group.toBuffer(), fixtureBuf, Buffer.from([0]), nonceBuf],
    program.programId,
  )[0];
}

function escrowPda(program: Harness["program"], pool: PublicKey) {
  return PublicKey.findProgramAddressSync([Buffer.from("escrow"), pool.toBuffer()], program.programId)[0];
}

function entryPda(program: Harness["program"], pool: PublicKey, user: PublicKey, outcome: number) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("entry"), pool.toBuffer(), user.toBuffer(), Buffer.from([outcome])],
    program.programId,
  )[0];
}

describe("Pool: create + place Entry (Open state, escrow custody)", () => {
  let h: Harness;
  let mint: PublicKey;
  const group = Keypair.generate().publicKey;
  const kickoff = new BN(2_000_000_000);

  beforeAll(async () => {
    h = await bootHarness();
    mint = await createUsdcMint(h.context);
  });

  async function createPool(fixtureId: bigint, nonce: bigint) {
    const pool = poolPda(h.program, group, fixtureId, nonce);
    const escrow = escrowPda(h.program, pool);
    await h.program.methods
      .createPool(group, new BN(fixtureId.toString()), MATCH_WINNER, new BN(nonce.toString()), kickoff)
      .accountsPartial({
        pool,
        escrow,
        usdcMint: mint,
        creator: h.provider.wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    return { pool, escrow };
  }

  /** A funded User keypair with `amount` USDC and SOL for fees. */
  async function makeUser(amount: bigint) {
    const user = Keypair.generate();
    await fundSol(h.context, user.publicKey, 1_000_000_000);
    const ata = await fundUsdc(h.context, mint, user.publicKey, amount);
    return { user, ata };
  }

  async function placeEntry(
    pool: PublicKey,
    escrow: PublicKey,
    user: Keypair,
    userAta: PublicKey,
    outcome: number,
    amount: bigint,
  ) {
    await h.program.methods
      .placeEntry(outcome, new BN(amount.toString()))
      .accountsPartial({
        pool,
        entry: entryPda(h.program, pool, user.publicKey, outcome),
        escrow,
        userUsdc: userAta,
        user: user.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([user])
      .rpc();
  }

  it("creates an Open Pool with a zeroed pot, Outcome totals, and empty escrow", async () => {
    const { pool, escrow } = await createPool(1n, 0n);

    const acct = await h.program.account.pool.fetch(pool);
    expect(acct.state).toEqual({ open: {} });
    expect(acct.group.equals(group)).toBe(true);
    expect(acct.fixtureId.toString()).toBe("1");
    expect(acct.kickoffTs.toString()).toBe(kickoff.toString());
    expect(acct.usdcMint.equals(mint)).toBe(true);
    expect(acct.pot.toString()).toBe("0");
    expect(acct.outcomeTotals.map((t) => t.toString())).toEqual(["0", "0", "0"]);
    expect(await tokenBalance(h.context, escrow)).toBe(0n);
  });

  it("places an Entry: USDC moves into escrow; pot, Outcome total, and Entry all credit the amount", async () => {
    const { pool, escrow } = await createPool(2n, 0n);
    const { user, ata } = await makeUser(1_000_000n);

    await placeEntry(pool, escrow, user, ata, 0, 400_000n);

    expect(await tokenBalance(h.context, escrow)).toBe(400_000n);
    expect(await tokenBalance(h.context, ata)).toBe(600_000n);
    const acct = await h.program.account.pool.fetch(pool);
    expect(acct.pot.toString()).toBe("400000");
    expect(acct.outcomeTotals[0].toString()).toBe("400000");
    const entry = await h.program.account.entry.fetch(entryPda(h.program, pool, user.publicKey, 0));
    expect(entry.amount.toString()).toBe("400000");
    expect(entry.outcome).toBe(0);
  });

  it("folds a repeat Entry on the same Outcome into one accumulating record", async () => {
    const { pool, escrow } = await createPool(3n, 0n);
    const { user, ata } = await makeUser(1_000_000n);

    await placeEntry(pool, escrow, user, ata, 1, 100_000n);
    await placeEntry(pool, escrow, user, ata, 1, 250_000n);

    const entry = await h.program.account.entry.fetch(entryPda(h.program, pool, user.publicKey, 1));
    expect(entry.amount.toString()).toBe("350000");
    const acct = await h.program.account.pool.fetch(pool);
    expect(acct.outcomeTotals[1].toString()).toBe("350000");
    expect(acct.pot.toString()).toBe("350000");
    expect(await tokenBalance(h.context, escrow)).toBe(350_000n);
  });

  it("lets one User hold Entries on more than one Outcome", async () => {
    const { pool, escrow } = await createPool(4n, 0n);
    const { user, ata } = await makeUser(1_000_000n);

    await placeEntry(pool, escrow, user, ata, 0, 100_000n);
    await placeEntry(pool, escrow, user, ata, 2, 300_000n);

    const e0 = await h.program.account.entry.fetch(entryPda(h.program, pool, user.publicKey, 0));
    const e2 = await h.program.account.entry.fetch(entryPda(h.program, pool, user.publicKey, 2));
    expect(e0.amount.toString()).toBe("100000");
    expect(e2.amount.toString()).toBe("300000");
    const acct = await h.program.account.pool.fetch(pool);
    expect(acct.outcomeTotals.map((t) => t.toString())).toEqual(["100000", "0", "300000"]);
    expect(acct.pot.toString()).toBe("400000");
  });

  it("keeps escrow == pot == sum of all Entries across many Users and Outcomes", async () => {
    const { pool, escrow } = await createPool(5n, 0n);
    // (outcome, amount) placements from three distinct Users.
    const placements: Array<[number, bigint]> = [
      [0, 500_000n],
      [1, 250_000n],
      [2, 750_000n],
      [0, 300_000n],
      [2, 200_000n],
    ];

    const perOutcome = [0n, 0n, 0n];
    let total = 0n;
    for (const [outcome, amount] of placements) {
      const { user, ata } = await makeUser(amount);
      await placeEntry(pool, escrow, user, ata, outcome, amount);
      perOutcome[outcome] += amount;
      total += amount;
    }

    const acct = await h.program.account.pool.fetch(pool);
    expect(acct.pot.toString()).toBe(total.toString());
    expect(await tokenBalance(h.context, escrow)).toBe(total);
    expect(acct.outcomeTotals.map((t) => t.toString())).toEqual(perOutcome.map((t) => t.toString()));
  });

  it("rejects a zero-amount Entry", async () => {
    const { pool, escrow } = await createPool(6n, 0n);
    const { user, ata } = await makeUser(1_000_000n);
    await expect(placeEntry(pool, escrow, user, ata, 0, 0n)).rejects.toThrow(/ZeroAmount/);
  });

  it("rejects an out-of-range Outcome", async () => {
    const { pool, escrow } = await createPool(7n, 0n);
    const { user, ata } = await makeUser(1_000_000n);
    await expect(placeEntry(pool, escrow, user, ata, 3, 100_000n)).rejects.toThrow(/InvalidOutcome/);
  });

  it("rejects an Entry once the Pool is not Open", async () => {
    const { pool, escrow } = await createPool(8n, 0n);
    const { user, ata } = await makeUser(1_000_000n);

    // No lock() instruction exists yet (T3), so force the Pool out of Open by
    // re-encoding its account with state = Locked and writing it back into the SVM.
    const acct = await h.program.account.pool.fetch(pool);
    const locked = await h.program.coder.accounts.encode("pool", { ...acct, state: { locked: {} } });
    const raw = await h.context.banksClient.getAccount(pool);
    if (!raw) throw new Error("pool account missing");
    h.context.setAccount(pool, {
      executable: raw.executable,
      owner: new PublicKey(raw.owner),
      lamports: Number(raw.lamports),
      data: locked,
      rentEpoch: Number(raw.rentEpoch),
    });

    await expect(placeEntry(pool, escrow, user, ata, 0, 100_000n)).rejects.toThrow(/PoolNotOpen/);
  });
});
