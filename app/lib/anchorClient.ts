import { AnchorProvider, BN, EventParser, Program, type Wallet } from "@coral-xyz/anchor";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import { Buffer } from "buffer";
import idl from "./idl/finalwhistle.json";
import type { Finalwhistle } from "./idl/finalwhistle";
import { RPC_URL, usdcMint } from "./config";
import { entryPda, escrowPda, poolPda } from "./pdas";

export type PoolState = "open" | "locked" | "settled" | "void";
// totalCorners/totalCards are no longer offered as markets (see lib/markets.ts) but stay here
// so Pools created before they were withdrawn still decode and can still be claimed/refunded.
export type PoolTypeName = "matchWinner" | "totalGoals" | "totalCorners" | "totalCards" | "handicap";

const POOL_TYPE_ARG: Record<PoolTypeName, object> = {
  matchWinner: { matchWinner: {} },
  totalGoals: { totalGoals: {} },
  totalCorners: { totalCorners: {} },
  totalCards: { totalCards: {} },
  handicap: { handicap: {} },
};
// Must match the PoolType discriminants in lib.rs — Handicap is appended last (4).
const POOL_TYPE_BYTE: Record<PoolTypeName, number> = { matchWinner: 0, totalGoals: 1, totalCorners: 2, totalCards: 3, handicap: 4 };

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
  poolType: PoolTypeName;
  lineX2: number;
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

  /** First free nonce for a Group + Fixture + Pool Type, probed against the chain. Counting
   * decodable Pools is not enough: pre-upgrade relic accounts still occupy their PDAs (they
   * are skipped by listPools) and would collide with a count-derived nonce. */
  async freeNonce(group: PublicKey, fixtureId: bigint, poolType: PoolTypeName): Promise<bigint> {
    const conn = this.program.provider.connection;
    for (let nonce = 0n; ; nonce++) {
      const pda = poolPda(group, fixtureId, nonce, POOL_TYPE_BYTE[poolType]);
      if (!(await conn.getAccountInfo(pda))) return nonce;
    }
  }

  /** Create a Pool on a Fixture in `group`; returns the Pool address. `lineX2` is the
   * Over/Under Line × 2 (odd half-integer) for `totalGoals`; ignored for `matchWinner`. */
  async createPool(
    group: PublicKey,
    fixtureId: bigint,
    nonce: bigint,
    kickoffTs: number,
    poolType: PoolTypeName = "matchWinner",
    lineX2 = 0,
  ): Promise<PublicKey> {
    const mint = usdcMint();
    const pool = poolPda(group, fixtureId, nonce, POOL_TYPE_BYTE[poolType]);
    await this.program.methods
      .createPool(
        group,
        new BN(fixtureId.toString()),
        POOL_TYPE_ARG[poolType],
        new BN(nonce.toString()),
        new BN(kickoffTs),
        lineX2,
      )
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
      poolType: (enumName(acct.poolType as Record<string, unknown>) ?? "matchWinner") as PoolTypeName,
      lineX2: acct.lineX2,
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

  /** Pool read via the cached server proxy (/api/chain/account) instead of a direct RPC, so N
   * browser tabs collapse to one cached chain read (avoids per-tab 429s). Browser-only — the
   * relative fetch has no origin server-side; server code uses fetchPool. */
  async fetchPoolCached(address: PublicKey): Promise<PoolAccount> {
    const res = await fetch(`/api/chain/account?key=${address.toBase58()}`);
    if (!res.ok) throw new Error(`account proxy ${res.status}`);
    const { data } = (await res.json()) as { data: string | null };
    if (!data) throw new Error("pool account not found");
    return this.decode(address, this.program.coder.accounts.decode("pool", Buffer.from(data, "base64")));
  }

  /** Group's Pools via the cached server proxy (/api/chain/program-accounts). Same defensive
   * per-account decode as listPools so an Entry or pre-upgrade Pool is skipped, not fatal. */
  async listPoolsCached(group: PublicKey): Promise<PoolAccount[]> {
    const res = await fetch(`/api/chain/program-accounts?group=${group.toBase58()}`);
    if (!res.ok) throw new Error(`accounts proxy ${res.status}`);
    const rows = (await res.json()) as Array<{ pubkey: string; data: string }>;
    const pools: PoolAccount[] = [];
    for (const { pubkey, data } of rows) {
      try {
        pools.push(this.decode(new PublicKey(pubkey), this.program.coder.accounts.decode("pool", Buffer.from(data, "base64"))));
      } catch {
        // not a current-layout Pool — skip
      }
    }
    return pools;
  }

  /** Wallets holding an Entry in a Pool — the real participants behind a Pool's avatars.
   * `Entry.pool` sits at offset 8, the same field the program-accounts proxy memcmps on, so
   * the Pool address doubles as the scan key and no new route is needed.
   * ponytail: winning Entries are closed on claim (ADR-0004), so a Settled Pool under-reports
   * as people cash out. Read pool_results instead if that ever matters. */
  async listEntrants(pool: PublicKey): Promise<string[]> {
    const res = await fetch(`/api/chain/program-accounts?group=${pool.toBase58()}`);
    if (!res.ok) return [];
    const rows = (await res.json()) as Array<{ pubkey: string; data: string }>;
    const wallets = new Set<string>();
    for (const { data } of rows) {
      try {
        const entry = this.program.coder.accounts.decode("entry", Buffer.from(data, "base64"));
        wallets.add(entry.user.toBase58());
      } catch {
        // the Pool account itself, or an older layout — skip
      }
    }
    return [...wallets];
  }

  /** Pools, optionally scoped to a Group (memcmp on the `group` field at offset 8).
   * Decodes each account defensively so an Entry account or a pre-upgrade Pool with an
   * older layout is skipped rather than breaking the whole list. */
  async listPools(group?: PublicKey): Promise<PoolAccount[]> {
    const filters = group ? [{ memcmp: { offset: 8, bytes: group.toBase58() } }] : [];
    const raw = await this.program.provider.connection.getProgramAccounts(this.program.programId, { filters });
    const pools: PoolAccount[] = [];
    for (const { pubkey, account } of raw) {
      try {
        // NB: the accounts coder keys layouts by camelCased IDL name — "pool", not "Pool".
        pools.push(this.decode(pubkey, this.program.coder.accounts.decode("pool", account.data)));
      } catch {
        // not a current-layout Pool — skip
      }
    }
    return pools;
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

/**
 * A wallet-less client for PUBLIC reads (share pages, OG images) — settlement data is all
 * on-chain. The dummy signer throws if anything tries to sign; only read paths use this.
 * Runs on the server (OG route) and the browser (public receipt page).
 */
export function readOnlyClient(): FinalWhistleClient {
  const connection = new Connection(RPC_URL, "confirmed");
  const noSign = (): never => {
    throw new Error("readOnlyClient cannot sign");
  };
  const wallet = { publicKey: PublicKey.default, signTransaction: noSign, signAllTransactions: noSign } as unknown as Wallet;
  return new FinalWhistleClient(connection, wallet);
}
