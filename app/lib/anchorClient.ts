import { AnchorProvider, BN, Program, type Wallet } from "@coral-xyz/anchor";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { type Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import idl from "./idl/finalwhistle.json";
import type { Finalwhistle } from "./idl/finalwhistle";
import { groupId, usdcMint } from "./config";
import { entryPda, escrowPda, poolPda } from "./pdas";

export type PoolState = "open" | "locked" | "settled" | "void";

export interface PoolAccount {
  address: PublicKey;
  group: PublicKey;
  creator: PublicKey;
  fixtureId: bigint;
  nonce: bigint;
  state: PoolState;
  kickoffTs: number;
  usdcMint: PublicKey;
  escrow: PublicKey;
  pot: bigint;
  outcomeTotals: [bigint, bigint, bigint];
  winningOutcome: number | null;
  voidReason: "abandoned" | "noWinningEntries" | "expired" | null;
}

function stateName(state: Record<string, unknown>): PoolState {
  return Object.keys(state)[0] as PoolState;
}

function enumName<T extends string>(value: Record<string, unknown> | null): T | null {
  return value ? (Object.keys(value)[0] as T) : null;
}

// The Match Winner (1X2) Pool Type discriminator the program expects (camelCase enum).
const MATCH_WINNER = { matchWinner: {} };

/** Typed client over the finalwhistle program, driven by the signed-in embedded wallet. */
export class FinalWhistleClient {
  readonly program: Program<Finalwhistle>;

  constructor(connection: Connection, wallet: Wallet) {
    const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
    this.program = new Program(idl as Finalwhistle, provider);
  }

  get wallet(): PublicKey {
    return this.program.provider.publicKey!;
  }

  /** Create a Match Winner Pool on a Fixture; returns the Pool address. */
  async createPool(fixtureId: bigint, nonce: bigint, kickoffTs: number): Promise<PublicKey> {
    const group = groupId();
    const mint = usdcMint();
    const pool = poolPda(group, fixtureId, nonce);
    await this.program.methods
      .createPool(group, new BN(fixtureId.toString()), MATCH_WINNER, new BN(nonce.toString()), new BN(kickoffTs))
      .accountsPartial({
        pool,
        escrow: escrowPda(pool),
        usdcMint: mint,
        creator: this.wallet,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    return pool;
  }

  /** Place an Entry of `amount` (base USDC units) on `outcome` of a Pool. */
  async placeEntry(pool: PublicKey, outcome: number, amount: bigint): Promise<void> {
    const mint = usdcMint();
    await this.program.methods
      .placeEntry(outcome, new BN(amount.toString()))
      .accountsPartial({
        pool,
        entry: entryPda(pool, this.wallet, outcome),
        escrow: escrowPda(pool),
        userUsdc: getAssociatedTokenAddressSync(mint, this.wallet),
        user: this.wallet,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  private async withdraw(method: "claimPayout" | "claimRefund", pool: PublicKey, outcome: number): Promise<void> {
    const mint = usdcMint();
    await this.program.methods[method]()
      .accountsPartial({
        pool,
        entry: entryPda(pool, this.wallet, outcome),
        escrow: escrowPda(pool),
        userUsdc: getAssociatedTokenAddressSync(mint, this.wallet),
        user: this.wallet,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
  }

  /** Claim a winning Entry's parimutuel payout. */
  claimPayout(pool: PublicKey, outcome: number): Promise<void> {
    return this.withdraw("claimPayout", pool, outcome);
  }

  /** Refund an Entry in full from a Void Pool. */
  claimRefund(pool: PublicKey, outcome: number): Promise<void> {
    return this.withdraw("claimRefund", pool, outcome);
  }

  private decode(address: PublicKey, acct: Awaited<ReturnType<Program<Finalwhistle>["account"]["pool"]["fetch"]>>): PoolAccount {
    return {
      address,
      group: acct.group,
      creator: acct.creator,
      fixtureId: BigInt(acct.fixtureId.toString()),
      nonce: BigInt(acct.nonce.toString()),
      state: stateName(acct.state as Record<string, unknown>),
      kickoffTs: acct.kickoffTs.toNumber(),
      usdcMint: acct.usdcMint,
      escrow: acct.escrow,
      pot: BigInt(acct.pot.toString()),
      outcomeTotals: acct.outcomeTotals.map((t) => BigInt(t.toString())) as [bigint, bigint, bigint],
      winningOutcome: acct.winningOutcome ?? null,
      voidReason: enumName(acct.voidReason as Record<string, unknown> | null),
    };
  }

  async fetchPool(address: PublicKey): Promise<PoolAccount> {
    return this.decode(address, await this.program.account.pool.fetch(address));
  }

  /** All Pools known to the program (demo scale — no pagination). */
  async listPools(): Promise<PoolAccount[]> {
    const all = await this.program.account.pool.all();
    return all.map((p) => this.decode(p.publicKey, p.account));
  }

  /** Does the signed-in User hold an Entry on this Outcome of this Pool? */
  async fetchEntryAmount(pool: PublicKey, outcome: number): Promise<bigint | null> {
    const entry = await this.program.account.entry.fetchNullable(entryPda(pool, this.wallet, outcome));
    return entry ? BigInt(entry.amount.toString()) : null;
  }
}
