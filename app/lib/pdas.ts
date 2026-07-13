import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID, TXLINE_PROGRAM_ID } from "./config";

function u64le(value: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(value);
  return b;
}

// Pool PDA: [b"pool", group, fixture_id, pool_type byte, nonce] — matches the program.
export function poolPda(group: PublicKey, fixtureId: bigint, nonce: bigint, poolTypeByte = 0): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), group.toBuffer(), u64le(fixtureId), Buffer.from([poolTypeByte]), u64le(nonce)],
    PROGRAM_ID,
  )[0];
}

export function escrowPda(pool: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("escrow"), pool.toBuffer()], PROGRAM_ID)[0];
}

export function entryPda(pool: PublicKey, user: PublicKey, outcome: number): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("entry"), pool.toBuffer(), user.toBuffer(), Buffer.from([outcome])],
    PROGRAM_ID,
  )[0];
}

/** The TxLINE-owned account holding a Fixture's score root: [b"root", fixture_id]. */
export function scoresRootPda(fixtureId: bigint): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("root"), u64le(fixtureId)], TXLINE_PROGRAM_ID)[0];
}
