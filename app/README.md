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
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — a free
  [Supabase](https://supabase.com) project for the live **Feed** (Realtime channels only —
  no database table needed). Leave blank to run without the Feed.
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
  totals; auto-claim on Settle; refund on Void; a live **Feed** (presence, messages,
  reactions, auto-posted Pool actions) on Supabase Realtime; and the **Proof Receipt** —
  the winning Outcome, proven stats, TxLINE score root, Merkle path, and settlement tx,
  rebuilt from the on-chain settlement so any Member can verify it.
- **Stand-ins:** Fixtures + Reference Odds are a documented mock of TxLINE's feed; the Feed's
  auto-posted **Fixture events** (live goals/cards) would come from TxLINE's scores stream at
  integration. Pool state still updates via polling; the Feed carries the social layer.
