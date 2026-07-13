import { keccak_256 } from "@noble/hashes/sha3";

// Client-side re-verification of a TxLINE Score Proof (ADR-0008). This mirrors the leaf/node
// encoding in keeper/merkle.ts and the on-chain compute_leaf/hash_node — the on-chain program
// is the real source of truth, and tests/proof-client.test.ts pins this to the keeper's encoding.
// Buffer-free so it runs in the browser without a polyfill.

export interface LeafStats {
  homeGoals: number;
  awayGoals: number;
  homeCorners: number;
  awayCorners: number;
  homeCards: number;
  awayCards: number;
  status: number;
}

function u64le(v: bigint): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, v, true);
  return b;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Lexicographic byte compare (a<b → <0), matching Buffer.compare used on the keeper side. */
function cmp(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** keccak leaf: 0x00 ‖ fixture_id(LE) ‖ 7 stat bytes. */
function leafHash(fixtureId: bigint, s: LeafStats): Uint8Array {
  return keccak_256(
    concat(
      Uint8Array.of(0x00),
      u64le(fixtureId),
      Uint8Array.of(s.homeGoals, s.awayGoals, s.homeCorners, s.awayCorners, s.homeCards, s.awayCards, s.status),
    ),
  );
}

/** keccak internal node: 0x01 ‖ min(a,b) ‖ max(a,b). */
function nodeHash(a: Uint8Array, b: Uint8Array): Uint8Array {
  const [lo, hi] = cmp(a, b) <= 0 ? [a, b] : [b, a];
  return keccak_256(concat(Uint8Array.of(0x01), lo, hi));
}

export interface ProofCheck {
  ok: boolean;
  computedRoot: Uint8Array;
}

/**
 * Independently recompute the score root from the receipt's proven values + Merkle path and
 * compare it to the root TxLINE published (which settle() verified on-chain). A match proves
 * these exact stats are what the Fixture leaf hashes to inside TxLINE's committed tree — i.e.
 * nobody edited the outcome. Runs entirely in the browser; trusts our server for nothing.
 */
export function verifyScoreProof(
  fixtureId: bigint,
  proven: LeafStats,
  merklePath: Uint8Array[],
  scoreRoot: Uint8Array,
): ProofCheck {
  let node = leafHash(fixtureId, proven);
  for (const sibling of merklePath) node = nodeHash(node, sibling);
  return { ok: bytesEqual(node, scoreRoot), computedRoot: node };
}
