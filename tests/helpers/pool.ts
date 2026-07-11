import { BN } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import type { Harness } from "./svm.js";
import { fundSol, fundUsdc } from "./token.js";

/** Match Winner (1X2): 0 = home win, 1 = draw, 2 = away win. */
export const MATCH_WINNER = { matchWinner: {} };

type Program = Harness["program"];

function u64le(value: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(value);
  return buf;
}

/** Pool PDA: [b"pool", group, fixture_id, pool_type=0 (MatchWinner), nonce]. */
export function poolPda(program: Program, group: PublicKey, fixtureId: bigint, nonce: bigint): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), group.toBuffer(), u64le(fixtureId), Buffer.from([0]), u64le(nonce)],
    program.programId,
  )[0];
}

export function escrowPda(program: Program, pool: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("escrow"), pool.toBuffer()], program.programId)[0];
}

export function entryPda(program: Program, pool: PublicKey, user: PublicKey, outcome: number): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("entry"), pool.toBuffer(), user.toBuffer(), Buffer.from([outcome])],
    program.programId,
  )[0];
}

/** Create a MatchWinner Pool; returns its Pool and escrow PDAs. */
export async function createPool(
  h: Harness,
  opts: { group: PublicKey; mint: PublicKey; fixtureId: bigint; nonce: bigint; kickoff: bigint },
): Promise<{ pool: PublicKey; escrow: PublicKey }> {
  const pool = poolPda(h.program, opts.group, opts.fixtureId, opts.nonce);
  const escrow = escrowPda(h.program, pool);
  await h.program.methods
    .createPool(
      opts.group,
      new BN(opts.fixtureId.toString()),
      MATCH_WINNER,
      new BN(opts.nonce.toString()),
      new BN(opts.kickoff.toString()),
    )
    .accountsPartial({
      pool,
      escrow,
      usdcMint: opts.mint,
      creator: h.provider.wallet.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  return { pool, escrow };
}

/** A funded User: a fresh keypair with `amount` USDC and SOL for fees. */
export async function makeUser(
  h: Harness,
  mint: PublicKey,
  amount: bigint,
): Promise<{ user: Keypair; ata: PublicKey }> {
  const user = Keypair.generate();
  await fundSol(h.context, user.publicKey, 1_000_000_000);
  const ata = await fundUsdc(h.context, mint, user.publicKey, amount);
  return { user, ata };
}

export async function placeEntry(
  h: Harness,
  args: { pool: PublicKey; escrow: PublicKey; user: Keypair; userAta: PublicKey; outcome: number; amount: bigint },
): Promise<void> {
  await h.program.methods
    .placeEntry(args.outcome, new BN(args.amount.toString()))
    .accountsPartial({
      pool: args.pool,
      entry: entryPda(h.program, args.pool, args.user.publicKey, args.outcome),
      escrow: args.escrow,
      userUsdc: args.userAta,
      user: args.user.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([args.user])
    .rpc();
}
