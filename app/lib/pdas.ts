import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./config";

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
