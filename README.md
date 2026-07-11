# xodds

Social prediction app for the 2026 World Cup. Friends stake real USDC in shared parimutuel pools; a public P2P order-book market runs for each match; settlement is trustless via TxLINE on-chain Merkle proofs.

See [`CONTEXT.md`](./CONTEXT.md) for the domain model and [`docs/adr/`](./docs/adr) for the key decisions.

## On-chain program

The Solana program lives in [`programs/finalwhistle`](./programs/finalwhistle). It builds with Anchor 0.31 / Solana 4.1 and is tested against an in-process SVM (`solana-bankrun`) — no local validator needed.

```sh
anchor build          # compile the program, emit target/idl + target/types
pnpm install          # one-time: install the TS test harness deps
pnpm test             # run the on-chain test suite (vitest + bankrun)
```

`pnpm test` is the one command to run the whole on-chain suite. `pnpm typecheck` type-checks the harness.

### Toolchain

- Rust + Solana CLI 4.1 (`cargo-build-sbf`), Anchor 0.31.1 (via `avm`), Node ≥ 20, pnpm.
- The SBF toolchain (platform-tools v1.54) ships rustc 1.79, so `programs/finalwhistle` pins `rust-version = "1.79.0"` and [`.cargo/config.toml`](./.cargo/config.toml) sets the MSRV-fallback resolver; `Cargo.lock` is committed to hold the 1.79-compatible dependency set. If you regenerate the lockfile and `anchor build` fails on `edition2024` / `requires rustc 1.85`, re-pin `blake3` to `1.5.5`.
