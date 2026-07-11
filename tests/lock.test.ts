import { Keypair, PublicKey } from "@solana/web3.js";
import { beforeAll, describe, expect, it } from "vitest";
import { setUnixTimestamp } from "./helpers/clock.js";
import { createPool, makeUser, placeEntry } from "./helpers/pool.js";
import { bootHarness, type Harness } from "./helpers/svm.js";
import { createUsdcMint, fundSol } from "./helpers/token.js";

describe("Pool: Lock at kickoff (permissionless, one-way)", () => {
  let h: Harness;
  let mint: PublicKey;
  const group = Keypair.generate().publicKey;
  const kickoff = 2_000_000_000n;

  beforeAll(async () => {
    h = await bootHarness();
    mint = await createUsdcMint(h.context);
  });

  const newPool = (fixtureId: bigint) => createPool(h, { group, mint, fixtureId, nonce: 0n, kickoff });

  /** A funded signer that is NOT the Pool creator — to prove Lock is permissionless. */
  async function stranger(): Promise<Keypair> {
    const kp = Keypair.generate();
    await fundSol(h.context, kp.publicKey, 1_000_000_000);
    return kp;
  }

  async function lock(pool: PublicKey, cranker: Keypair): Promise<void> {
    await h.program.methods.lock().accountsPartial({ pool, cranker: cranker.publicKey }).signers([cranker]).rpc();
  }

  it("refuses to Lock before kickoff", async () => {
    const { pool } = await newPool(1n);
    await setUnixTimestamp(h.context, Number(kickoff - 100n));
    await expect(lock(pool, await stranger())).rejects.toThrow(/BeforeKickoff/);
    expect((await h.program.account.pool.fetch(pool)).state).toEqual({ open: {} });
  });

  it("Locks at kickoff when cranked by an arbitrary (non-creator) signer", async () => {
    const { pool } = await newPool(2n);
    await setUnixTimestamp(h.context, Number(kickoff)); // now == kickoff satisfies now >= kickoff

    await lock(pool, await stranger());

    expect((await h.program.account.pool.fetch(pool)).state).toEqual({ locked: {} });
  });

  it("rejects a place_entry once the Pool is Locked", async () => {
    const { pool, escrow } = await newPool(3n);
    const { user, ata } = await makeUser(h, mint, 1_000_000n);
    await setUnixTimestamp(h.context, Number(kickoff));

    await lock(pool, await stranger());

    await expect(
      placeEntry(h, { pool, escrow, user, userAta: ata, outcome: 0, amount: 100_000n }),
    ).rejects.toThrow(/PoolNotOpen/);
  });

  it("refuses to Lock an already-Locked Pool (one-way)", async () => {
    const { pool } = await newPool(4n);
    await setUnixTimestamp(h.context, Number(kickoff));

    await lock(pool, await stranger());
    await expect(lock(pool, await stranger())).rejects.toThrow(/PoolNotOpen/);
  });

  // No settle()/void() instruction yet (T4/T6); force the Pool into each terminal
  // state by re-encoding it, to prove Lock is rejected from every non-Open state.
  it.each([
    ["Settled", { settled: {} }, 5n],
    ["Void", { void: {} }, 6n],
  ] as const)("refuses to Lock a terminal (%s) Pool", async (_label, state, fixtureId) => {
    const { pool } = await newPool(fixtureId);
    await setUnixTimestamp(h.context, Number(kickoff));

    const acct = await h.program.account.pool.fetch(pool);
    const data = await h.program.coder.accounts.encode("pool", { ...acct, state });
    const raw = await h.context.banksClient.getAccount(pool);
    if (!raw) throw new Error("pool account missing");
    h.context.setAccount(pool, {
      executable: raw.executable,
      owner: new PublicKey(raw.owner),
      lamports: Number(raw.lamports),
      data,
      rentEpoch: Number(raw.rentEpoch),
    });

    await expect(lock(pool, await stranger())).rejects.toThrow(/PoolNotOpen/);
  });
});
