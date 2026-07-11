# The Score Proof Merkle scheme is our own, keccak-256, domain-separated

ADR-0004 decided settlement verifies TxLINE's Merkle inclusion proof **in our own program**. That requires a concrete leaf/hash format both sides agree on. TxLINE's real `daily_scores_roots` leaf encoding was not available to us when building the slice, so we define the scheme ourselves and reconcile with TxLINE's published format at integration. The scheme is structurally faithful to what an oracle Merkle feed does, so reconciliation is a constant swap, not a redesign.

**Leaf** — the finalised Fixture record, keccak-256 of a domain-separated, canonical byte string:

```
leaf = keccak256( 0x00 ‖ fixture_id (u64 LE)
                       ‖ home_goals ‖ away_goals
                       ‖ home_corners ‖ away_corners
                       ‖ home_cards ‖ away_cards
                       ‖ status )            // status: 0 = finalised, 1 = abandoned
```

**Node** — keccak-256 of the two children, a different domain prefix, **sorted** so the proof carries no direction bits:

```
node = keccak256( 0x01 ‖ min(a,b) ‖ max(a,b) )
```

**Root** — read from the TxLINE-owned `daily_scores_roots` account passed read-only to `settle`. The trust boundary is the account's **owner**: the program requires `scores_root.owner == TXLINE_PROGRAM_ID` and reads the 32-byte root from it. An attacker cannot substitute a self-made root because they cannot create a TxLINE-owned account, and cannot substitute the wrong day's root because the Fixture's leaf will not be in that tree.

Rationale:

- **keccak-256, not SHA3-256.** Solana's `keccak` syscall is Ethereum-style Keccak-256, which is *not* the same as FIPS SHA3-256 (`js-sha3`/`@noble/hashes` expose both — the fixture builder must use `keccak_256`). Node's built-in `crypto` only offers SHA3, so the fixture builder uses `@noble/hashes`.
- **Domain separation (0x00 leaf / 0x01 node).** Prevents second-preimage attacks where a leaf could be reinterpreted as an internal node — the standard Merkle safety rule, and it makes sorted-pair hashing safe.
- **Sorted pairs.** The proof is just a list of sibling hashes; the verifier needs no left/right index, which is the smallest on-chain hash-walk. Inclusion is all we need — we do not need to prove a leaf's position.
- **`fixture_id` in the leaf, bound to the Pool.** `settle` computes the leaf from `pool.fixture_id` (not from caller input), so a valid proof for a *different* Fixture cannot settle this Pool.
- **`status` in the leaf.** Abandonment is itself proven by TxLINE, so ADR-0004's trustlessness extends to the Void-on-abandoned path (T6), not just the winner path.

Consequence: `TXLINE_PROGRAM_ID` and the leaf byte-offsets are MVP stand-ins. A reader integrating the real feed must (1) set `TXLINE_PROGRAM_ID` to TxLINE's program, and (2) align the leaf encoding and the root's account-data offset with TxLINE's published schema — changing both the on-chain `compute_leaf`/`read_scores_root` and the TS fixture builder together, or proofs will silently fail to verify.
