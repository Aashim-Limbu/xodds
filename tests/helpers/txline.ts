import { Keypair, PublicKey } from "@solana/web3.js";
import type { ProgramTestContext } from "solana-bankrun";
import { TXLINE_PROGRAM_ID } from "../../keeper/merkle.js";

// The ADR-0008 Merkle scheme lives in keeper/merkle.ts — shared with the Keeper so the
// proofs it submits use exactly the code the tests pin. Re-exported here for test imports.
export {
  buildScoreProof,
  leafHash,
  STATUS_ABANDONED,
  STATUS_FINALISED,
  TXLINE_PROGRAM_ID,
  type FixtureStats,
  type ScoreProof,
  type ScoreProofBundle,
} from "../../keeper/merkle.js";

/**
 * Publish a fabricated score root into the SVM as a TxLINE-owned account, mirroring the
 * txline_mock `ScoresRoot` layout: an 8-byte Anchor discriminator then the 32-byte root
 * (finalwhistle reads bytes [8..40]). Bankrun-only. Returns the address.
 */
export function publishScoresRoot(context: ProgramTestContext, root: Uint8Array): PublicKey {
  const account = Keypair.generate().publicKey;
  context.setAccount(account, {
    executable: false,
    owner: TXLINE_PROGRAM_ID,
    lamports: 1_000_000,
    data: Buffer.concat([Buffer.alloc(8), Buffer.from(root)]), // 8-byte discriminator + root
    rentEpoch: 0,
  });
  return account;
}
