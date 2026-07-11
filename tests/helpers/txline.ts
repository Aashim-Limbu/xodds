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
 * Publish a fabricated score root into the SVM as a TxLINE-owned account, mirroring
 * TxLINE's `daily_scores_roots` (root bytes at offset 0). Bankrun-only. Returns the address.
 */
export function publishScoresRoot(context: ProgramTestContext, root: Uint8Array): PublicKey {
  const account = Keypair.generate().publicKey;
  context.setAccount(account, {
    executable: false,
    owner: TXLINE_PROGRAM_ID,
    lamports: 1_000_000,
    data: Buffer.from(root),
    rentEpoch: 0,
  });
  return account;
}
