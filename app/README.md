# FinalWhistle app

The consumer web app (Next.js App Router) for FinalWhistle. Sign in with email → an
embedded, non-custodial Solana wallet is created automatically (Privy, ADR-0005); create
a Match Winner (1X2) **Pool** on a **Fixture**, place **Entries** with **Reference Odds**
shown, watch the pot/Outcome totals/state live, and get paid automatically when the Pool
Settles (or refunded on Void).

## Setup

```sh
cd app
pnpm install
cp .env.example .env.local   # then fill it in (see below)
pnpm dev                     # http://localhost:3000
```

`.env.local` values:

- `NEXT_PUBLIC_PRIVY_APP_ID` — create an app at [dashboard.privy.io](https://dashboard.privy.io);
  enable **Email** login and **Solana embedded wallets**.
- `NEXT_PUBLIC_RPC_URL` — devnet by default.
- `NEXT_PUBLIC_PROGRAM_ID` — the deployed program (defaults to the workspace program id).
- `NEXT_PUBLIC_USDC_MINT` — a devnet USDC-like SPL mint (see below).

## Deploy the program to devnet (once)

The program isn't deployed yet — the automated devnet faucet was exhausted at build time.
Fund the wallet and deploy from the repo root:

```sh
solana config set --url devnet
solana airdrop 2                     # repeat until you have ~3 SOL (faucet is flaky)
anchor deploy --provider.cluster devnet   # deploys at the program id in Anchor.toml / the IDL
```

## Devnet USDC for testing

Create a mint and fund a test wallet, then paste the mint into `NEXT_PUBLIC_USDC_MINT`:

```sh
spl-token create-token --decimals 6           # -> <MINT>
spl-token create-account <MINT>
spl-token mint <MINT> 1000                     # to your embedded-wallet address
```

Each User needs an associated `<MINT>` account with a balance to place Entries.

## What this app is (and isn't)

- **Is:** onboarding + create/enter/state UI wired to the on-chain program; live pot/Outcome
  totals via polling; auto-claim on Settle; refund on Void.
- **Isn't (yet):** the rich social **Feed** (auto-posted events, chat, presence) and the
  **Proof Receipt** — those are ticket T8. Live updates here use polling; T8 swaps in the
  rented realtime layer (ADR-0006).
