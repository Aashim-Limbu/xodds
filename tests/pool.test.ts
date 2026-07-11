import { Keypair, PublicKey } from "@solana/web3.js";
import { beforeAll, describe, expect, it } from "vitest";
import { bootHarness, type Harness } from "./helpers/svm.js";
import { createPool, entryPda, makeUser, placeEntry } from "./helpers/pool.js";
import { createUsdcMint, tokenBalance } from "./helpers/token.js";

describe("Pool: create + place Entry (Open state, escrow custody)", () => {
  let h: Harness;
  let mint: PublicKey;
  const group = Keypair.generate().publicKey;
  const kickoff = 2_000_000_000n;

  beforeAll(async () => {
    h = await bootHarness();
    mint = await createUsdcMint(h.context);
  });

  const newPool = (fixtureId: bigint) => createPool(h, { group, mint, fixtureId, nonce: 0n, kickoff });

  it("creates an Open Pool with a zeroed pot, Outcome totals, and empty escrow", async () => {
    const { pool, escrow } = await newPool(1n);

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
    const { pool, escrow } = await newPool(2n);
    const { user, ata } = await makeUser(h, mint, 1_000_000n);

    await placeEntry(h, { pool, escrow, user, userAta: ata, outcome: 0, amount: 400_000n });

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
    const { pool, escrow } = await newPool(3n);
    const { user, ata } = await makeUser(h, mint, 1_000_000n);

    await placeEntry(h, { pool, escrow, user, userAta: ata, outcome: 1, amount: 100_000n });
    await placeEntry(h, { pool, escrow, user, userAta: ata, outcome: 1, amount: 250_000n });

    const entry = await h.program.account.entry.fetch(entryPda(h.program, pool, user.publicKey, 1));
    expect(entry.amount.toString()).toBe("350000");
    const acct = await h.program.account.pool.fetch(pool);
    expect(acct.outcomeTotals[1].toString()).toBe("350000");
    expect(acct.pot.toString()).toBe("350000");
    expect(await tokenBalance(h.context, escrow)).toBe(350_000n);
  });

  it("lets one User hold Entries on more than one Outcome", async () => {
    const { pool, escrow } = await newPool(4n);
    const { user, ata } = await makeUser(h, mint, 1_000_000n);

    await placeEntry(h, { pool, escrow, user, userAta: ata, outcome: 0, amount: 100_000n });
    await placeEntry(h, { pool, escrow, user, userAta: ata, outcome: 2, amount: 300_000n });

    const e0 = await h.program.account.entry.fetch(entryPda(h.program, pool, user.publicKey, 0));
    const e2 = await h.program.account.entry.fetch(entryPda(h.program, pool, user.publicKey, 2));
    expect(e0.amount.toString()).toBe("100000");
    expect(e2.amount.toString()).toBe("300000");
    const acct = await h.program.account.pool.fetch(pool);
    expect(acct.outcomeTotals.map((t) => t.toString())).toEqual(["100000", "0", "300000"]);
    expect(acct.pot.toString()).toBe("400000");
  });

  it("keeps escrow == pot == sum of all Entries across many Users and Outcomes", async () => {
    const { pool, escrow } = await newPool(5n);
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
      const { user, ata } = await makeUser(h, mint, amount);
      await placeEntry(h, { pool, escrow, user, userAta: ata, outcome, amount });
      perOutcome[outcome] += amount;
      total += amount;
    }

    const acct = await h.program.account.pool.fetch(pool);
    expect(acct.pot.toString()).toBe(total.toString());
    expect(await tokenBalance(h.context, escrow)).toBe(total);
    expect(acct.outcomeTotals.map((t) => t.toString())).toEqual(perOutcome.map((t) => t.toString()));
  });

  it("rejects a zero-amount Entry", async () => {
    const { pool, escrow } = await newPool(6n);
    const { user, ata } = await makeUser(h, mint, 1_000_000n);
    await expect(
      placeEntry(h, { pool, escrow, user, userAta: ata, outcome: 0, amount: 0n }),
    ).rejects.toThrow(/ZeroAmount/);
  });

  it("rejects an out-of-range Outcome", async () => {
    const { pool, escrow } = await newPool(7n);
    const { user, ata } = await makeUser(h, mint, 1_000_000n);
    await expect(
      placeEntry(h, { pool, escrow, user, userAta: ata, outcome: 3, amount: 100_000n }),
    ).rejects.toThrow(/InvalidOutcome/);
  });
});
