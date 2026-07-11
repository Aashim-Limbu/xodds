import { describe, expect, it } from "vitest";
import { buildScoreProof, type FixtureStats, leafHash } from "./helpers/txline.js";

// Known-answer vectors that pin the keccak byte layout (ADR-0008) to fixed values.
// The on-chain program's compute_leaf/hash_node must produce identical bytes — every
// settle test proves TS<->Rust self-consistency, but only these literals catch a
// *matched* edit to both sides. Regenerate deliberately (and reconcile with TxLINE's
// real schema) if the leaf/node encoding ever changes.
const target: FixtureStats = {
  fixtureId: 10n,
  homeGoals: 2,
  awayGoals: 1,
  homeCorners: 4,
  awayCorners: 3,
  homeCards: 2,
  awayCards: 1,
};
const decoy: FixtureStats = {
  fixtureId: 900n,
  homeGoals: 0,
  awayGoals: 0,
  homeCorners: 1,
  awayCorners: 1,
  homeCards: 0,
  awayCards: 0,
};

describe("TxLINE Merkle scheme (ADR-0008) known-answer vectors", () => {
  it("hashes a leaf to the pinned keccak-256 value", () => {
    expect(Buffer.from(leafHash(target)).toString("hex")).toBe(
      "ef1b6621bbdd87ee2875b3655a83a8410fb4900cf763ff1a8bd697c9cc8b67b1",
    );
  });

  it("composes a two-leaf root (exercises the sorted-pair node hash)", () => {
    const { root } = buildScoreProof(target, [decoy]);
    expect(Buffer.from(root).toString("hex")).toBe(
      "c452f950251865dcb7c976596057dd24eb28cb38b0f658d0d9fbd27fce9293f5",
    );
  });
});
