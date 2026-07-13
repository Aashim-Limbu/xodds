import { describe, expect, it } from "vitest";
import { buildScoreProof } from "../keeper/merkle";
import { verifyScoreProof } from "../app/lib/proof";

// The Proof Receipt's browser-side verifier (app/lib/proof.ts) must agree byte-for-byte with the
// keeper's encoding (keeper/merkle.ts, itself pinned to on-chain by tests/txline.test.ts). If these
// two ever drift, a genuine receipt would show "Verification failed" to real users.
describe("client Proof Receipt verification", () => {
  const target = {
    fixtureId: 1001n,
    homeGoals: 2, awayGoals: 1,
    homeCorners: 7, awayCorners: 4,
    homeCards: 3, awayCards: 5,
    status: 0,
  };
  const others = [
    { fixtureId: 1002n, homeGoals: 0, awayGoals: 0, homeCorners: 3, awayCorners: 3, homeCards: 1, awayCards: 1, status: 0 },
    { fixtureId: 1003n, homeGoals: 3, awayGoals: 3, homeCorners: 9, awayCorners: 8, homeCards: 2, awayCards: 2, status: 0 },
  ];

  it("reproduces the keeper's root (encodings agree)", () => {
    const { root, proof } = buildScoreProof(target, others);
    const path = proof.merklePath.map((p) => Uint8Array.from(p));
    const check = verifyScoreProof(target.fixtureId, target, path, root);
    expect(check.ok).toBe(true);
    expect(Buffer.from(check.computedRoot)).toEqual(Buffer.from(root));
  });

  it("fails when a proven stat is tampered", () => {
    const { root, proof } = buildScoreProof(target, others);
    const path = proof.merklePath.map((p) => Uint8Array.from(p));
    const check = verifyScoreProof(target.fixtureId, { ...target, homeGoals: 5 }, path, root);
    expect(check.ok).toBe(false);
  });

  it("verifies a single-fixture tree (empty path, leaf is the root)", () => {
    const { root, proof } = buildScoreProof(target, []);
    expect(proof.merklePath.length).toBe(0);
    const check = verifyScoreProof(target.fixtureId, target, [], root);
    expect(check.ok).toBe(true);
  });
});
