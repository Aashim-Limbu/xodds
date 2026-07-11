import { keccak_256 } from "@noble/hashes/sha3";
import { PublicKey } from "@solana/web3.js";

// The TxLINE Score Proof Merkle scheme (ADR-0008), shared by the Keeper (which builds
// proofs to submit) and the test harness (which fabricates them). This is the single
// source of the leaf/node encoding — it MUST match the on-chain compute_leaf/hash_node,
// and tests/txline.test.ts pins it to known-answer vectors.

// MVP stand-in for TxLINE's program id (matches TXLINE_PROGRAM_ID on-chain). A score
// root is only honoured if its account is owned by this program.
export const TXLINE_PROGRAM_ID = new PublicKey("FrcPceS49sTJp9R2Mp4fH4oxZ3bRRM1ggL13z72hDHmq");

export const STATUS_FINALISED = 0;
export const STATUS_ABANDONED = 1;

/** A finalised Fixture's team-level stats — the leaf contents. */
export interface FixtureStats {
  fixtureId: bigint;
  homeGoals: number;
  awayGoals: number;
  homeCorners: number;
  awayCorners: number;
  homeCards: number;
  awayCards: number;
  status?: number; // defaults to finalised
}

function u64le(value: bigint): Uint8Array {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(value);
  return b;
}

/** keccak-256 leaf: 0x00 ‖ fixture_id(LE) ‖ 7 stat bytes (must match compute_leaf on-chain). */
export function leafHash(s: FixtureStats): Uint8Array {
  const status = s.status ?? STATUS_FINALISED;
  return keccak_256(
    Buffer.concat([
      Uint8Array.of(0x00),
      u64le(s.fixtureId),
      Uint8Array.of(s.homeGoals, s.awayGoals, s.homeCorners, s.awayCorners, s.homeCards, s.awayCards, status),
    ]),
  );
}

/** keccak-256 internal node: 0x01 ‖ min(a,b) ‖ max(a,b) (must match hash_node on-chain). */
function nodeHash(a: Uint8Array, b: Uint8Array): Uint8Array {
  const [lo, hi] = Buffer.compare(Buffer.from(a), Buffer.from(b)) <= 0 ? [a, b] : [b, a];
  return keccak_256(Buffer.concat([Uint8Array.of(0x01), lo, hi]));
}

/** Build a sorted-pair Merkle tree over `leaves` and return the root + inclusion path for `index`. */
function buildTree(leaves: Uint8Array[], index: number): { root: Uint8Array; path: Uint8Array[] } {
  if (leaves.length === 0) throw new Error("cannot build a Merkle tree over zero leaves");
  const path: Uint8Array[] = [];
  let level = leaves;
  let idx = index;
  while (level.length > 1) {
    const next: Uint8Array[] = [];
    for (let i = 0; i < level.length; i += 2) {
      if (i + 1 < level.length) {
        next.push(nodeHash(level[i], level[i + 1]));
        if (i === idx || i + 1 === idx) {
          path.push(level[i === idx ? i + 1 : i]);
          idx = next.length - 1;
        }
      } else {
        next.push(level[i]); // odd tail promotes unchanged; no sibling in the path
        if (i === idx) idx = next.length - 1;
      }
    }
    level = next;
  }
  return { root: level[0], path };
}

export interface ScoreProof {
  homeGoals: number;
  awayGoals: number;
  homeCorners: number;
  awayCorners: number;
  homeCards: number;
  awayCards: number;
  status: number;
  merklePath: number[][]; // each sibling as a 32-length byte array (Anchor arg shape)
}

export interface ScoreProofBundle {
  root: Uint8Array;
  proof: ScoreProof;
}

/**
 * Build the Score Proof for `target` against the day's tree, where `others` are the
 * co-located Fixtures whose leaves are its Merkle siblings. Returns both the recomputed
 * `root` and the `proof`: the Keeper submits `.proof` against TxLINE's published root,
 * while tests use `.root` to fabricate one.
 */
export function buildScoreProof(target: FixtureStats, others: FixtureStats[] = []): ScoreProofBundle {
  const all = [target, ...others];
  const leaves = all.map(leafHash);
  const { root, path } = buildTree(leaves, 0);
  const status = target.status ?? STATUS_FINALISED;
  return {
    root,
    proof: {
      homeGoals: target.homeGoals,
      awayGoals: target.awayGoals,
      homeCorners: target.homeCorners,
      awayCorners: target.awayCorners,
      homeCards: target.homeCards,
      awayCards: target.awayCards,
      status,
      merklePath: path.map((p) => Array.from(p)),
    },
  };
}
