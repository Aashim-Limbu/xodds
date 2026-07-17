import { BN } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import type { Harness } from "./svm.js";
import { fundSol, fundUsdc } from "./token.js";
import type { ScoreProof } from "./txline.js";

/** Match Winner (1X2): 0 = home win, 1 = draw, 2 = away win. */
export const MATCH_WINNER = { matchWinner: {} };
/** Total Goals O/U: 0 = Over, 1 = Under. */
export const TOTAL_GOALS = { totalGoals: {} };

type PoolTypeName = "matchWinner" | "totalGoals" | "totalCorners" | "totalCards";
const POOL_TYPES: Record<PoolTypeName, { arg: object; byte: number }> = {
  matchWinner: { arg: MATCH_WINNER, byte: 0 },
  totalGoals: { arg: TOTAL_GOALS, byte: 1 },
  totalCorners: { arg: { totalCorners: {} }, byte: 2 },
  totalCards: { arg: { totalCards: {} }, byte: 3 },
};

type Program = Harness["program"];

function u64le(value: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(value);
  return buf;
}

/** Pool PDA: [b"pool", group, fixture_id, pool_type byte, nonce]. */
export function poolPda(
  program: Program,
  group: PublicKey,
  fixtureId: bigint,
  nonce: bigint,
  poolTypeByte = 0,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), group.toBuffer(), u64le(fixtureId), Buffer.from([poolTypeByte]), u64le(nonce)],
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

/** Create a Pool (MatchWinner by default; pass poolType/lineX2 for O/U). */
export async function createPool(
  h: Harness,
  opts: {
    group: PublicKey;
    mint: PublicKey;
    fixtureId: bigint;
    nonce: bigint;
    kickoff: bigint;
    poolType?: PoolTypeName;
    lineX2?: number;
  },
): Promise<{ pool: PublicKey; escrow: PublicKey }> {
  const pt = POOL_TYPES[opts.poolType ?? "matchWinner"];
  const pool = poolPda(h.program, opts.group, opts.fixtureId, opts.nonce, pt.byte);
  const escrow = escrowPda(h.program, pool);
  await h.program.methods
    .createPool(
      opts.group,
      new BN(opts.fixtureId.toString()),
      pt.arg,
      new BN(opts.nonce.toString()),
      new BN(opts.kickoff.toString()),
      opts.lineX2 ?? 0,
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

/** A funded signer that is NOT the Pool creator — proves an instruction is permissionless. */
export async function fundedSigner(h: Harness): Promise<Keypair> {
  const kp = Keypair.generate();
  await fundSol(h.context, kp.publicKey, 1_000_000_000);
  return kp;
}

export async function lockPool(h: Harness, pool: PublicKey, signer: Keypair): Promise<void> {
  await h.program.methods.lock().accountsPartial({ pool, signer: signer.publicKey }).signers([signer]).rpc();
}

export async function settlePool(
  h: Harness,
  args: { pool: PublicKey; scoresRoot: PublicKey; proof: ScoreProof; signer: Keypair },
): Promise<void> {
  await h.program.methods
    .settle(args.proof)
    .accountsPartial({ pool: args.pool, scoresRoot: args.scoresRoot, signer: args.signer.publicKey })
    .signers([args.signer])
    .rpc();
}

/** Claim a winning Entry's payout. `outcome` is the Outcome the User's Entry is on. */
export async function claimPayout(
  h: Harness,
  args: { pool: PublicKey; escrow: PublicKey; user: Keypair; userAta: PublicKey; outcome: number },
): Promise<void> {
  await h.program.methods
    .claimPayout()
    .accountsPartial({
      pool: args.pool,
      entry: entryPda(h.program, args.pool, args.user.publicKey, args.outcome),
      escrow: args.escrow,
      userUsdc: args.userAta,
      user: args.user.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([args.user])
    .rpc();
}

/** Permissionlessly Void a still-Locked Pool whose grace window has elapsed. */
export async function voidExpired(h: Harness, pool: PublicKey, signer: Keypair): Promise<void> {
  await h.program.methods
    .voidExpired()
    .accountsPartial({ pool, signer: signer.publicKey })
    .signers([signer])
    .rpc();
}

/** Refund an Entry in full from a Void Pool. `outcome` is the Outcome the Entry is on. */
export async function claimRefund(
  h: Harness,
  args: { pool: PublicKey; escrow: PublicKey; user: Keypair; userAta: PublicKey; outcome: number },
): Promise<void> {
  await h.program.methods
    .claimRefund()
    .accountsPartial({
      pool: args.pool,
      entry: entryPda(h.program, args.pool, args.user.publicKey, args.outcome),
      escrow: args.escrow,
      userUsdc: args.userAta,
      user: args.user.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([args.user])
    .rpc();
}
