import { AnchorProvider, BN, EventParser, Program, type Wallet } from "@coral-xyz/anchor";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { type Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import idl from "./idl/finalwhistle.json";
import type { Finalwhistle } from "./idl/finalwhistle";
import { usdcMint } from "./config";
import { entryPda, escrowPda, poolPda } from "./pdas";

export type PoolState = "open" | "locked" | "settled" | "void";

export interface ProvenStats {
  homeGoals: number;
  awayGoals: number;
  homeCorners: number;
  awayCorners: number;
  homeCards: number;
  awayCards: number;
  status: number;
}

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
  proven: ProvenStats;
  scoreRoot: Uint8Array;
}

/** The Proof Receipt data: everything needed to independently verify the settlement. */
export interface SettlementReceipt {
  winningOutcome: number;
  proven: ProvenStats;
  scoreRoot: Uint8Array;
  merklePath: Uint8Array[];
  signature: string;
}

function toBytes(arr: number[]): Uint8Array {
  return Uint8Array.from(arr);
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

  /** Create a Match Winner Pool on a Fixture in `group`; returns the Pool address. */
  async createPool(group: PublicKey, fixtureId: bigint, nonce: bigint, kickoffTs: number): Promise<PublicKey> {
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
    const userUsdc = getAssociatedTokenAddressSync(mint, this.wallet);
    await this.program.methods
      .placeEntry(outcome, new BN(amount.toString()))
      .accountsPartial({
        pool,
        entry: entryPda(pool, this.wallet, outcome),
        escrow: escrowPda(pool),
        userUsdc,
        user: this.wallet,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      // Create the User's USDC account if it doesn't exist yet, so the first Entry from a
      // fresh embedded wallet doesn't fail with AccountNotInitialized.
      .preInstructions([
        createAssociatedTokenAccountIdempotentInstruction(this.wallet, userUsdc, this.wallet, mint),
      ])
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
      proven: { ...acct.proven },
      scoreRoot: toBytes(acct.scoreRoot),
    };
  }

  async fetchPool(address: PublicKey): Promise<PoolAccount> {
    return this.decode(address, await this.program.account.pool.fetch(address));
  }

  /** Pools, optionally scoped to a Group (memcmp on the `group` field at offset 8). */
  async listPools(group?: PublicKey): Promise<PoolAccount[]> {
    const filters = group ? [{ memcmp: { offset: 8, bytes: group.toBase58() } }] : [];
    const all = await this.program.account.pool.all(filters);
    return all.map((p) => this.decode(p.publicKey, p.account));
  }

  /** Does the signed-in User hold an Entry on this Outcome of this Pool? */
  async fetchEntryAmount(pool: PublicKey, outcome: number): Promise<bigint | null> {
    const entry = await this.program.account.entry.fetchNullable(entryPda(pool, this.wallet, outcome));
    return entry ? BigInt(entry.amount.toString()) : null;
  }

  /**
   * Reconstruct the Proof Receipt for a Settled Pool by finding its settle transaction
   * and parsing the PoolSettled event — the Merkle path and settlement signature live in
   * the event (not on the account). Returns null if no settlement is found.
   */
  async fetchSettlement(pool: PublicKey): Promise<SettlementReceipt | null> {
    const connection = this.program.provider.connection;
    const parser = new EventParser(this.program.programId, this.program.coder);
    const sigs = await connection.getSignaturesForAddress(pool, { limit: 30 });
    for (const { signature } of sigs) {
      const tx = await connection.getTransaction(signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
      const logs = tx?.meta?.logMessages;
      if (!logs) continue;
      for (const event of parser.parseLogs(logs)) {
        if (event.name.toLowerCase() === "poolsettled") {
          const data = event.data as {
            winningOutcome: number;
            proven: ProvenStats;
            scoreRoot: number[];
            merklePath: number[][];
          };
          return {
            winningOutcome: data.winningOutcome,
            proven: { ...data.proven },
            scoreRoot: toBytes(data.scoreRoot),
            merklePath: data.merklePath.map(toBytes),
            signature,
          };
        }
      }
    }
    return null;
  }
}

/** Lowercase hex of a byte array, for rendering roots and Merkle nodes. */
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
