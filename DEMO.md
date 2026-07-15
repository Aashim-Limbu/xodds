# Demo run-of-show

The exact startup order and a 3-minute walkthrough. Everything runs on devnet; the programs
(`finalwhistle` 3twLVgx…, `txline_mock` 7yYhmy4x…) are already deployed — no anchor step.

## One-time setup

1. **Env** — `cp app/.env.example app/.env.local` and fill:
   - `NEXT_PUBLIC_PRIVY_APP_ID` — Privy app with Email + Solana embedded wallets (ADR-0005).
   - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — free Supabase project; **without these the Feed (chat/presence) is off**.
   - `NEXT_PUBLIC_USDC_MINT` — the devnet test mint (see app/README.md to create one).
   - `FAUCET_KEYPAIR` — path to the mint-authority keypair (funds test users).
   - `TXLINE_API_TOKEN` — optional; real TxLINE data. Unset = scripted stand-in slate.
2. **Feed history table** (optional but recommended — otherwise chat is ephemeral and wiped
   on reload). In the Supabase SQL editor:

   ```sql
   create table if not exists feed_events (
     id text primary key,
     channel text not null,
     kind text not null,
     author text not null default '',
     text text not null,
     ts bigint not null
   );
   create index if not exists feed_events_channel_ts on feed_events (channel, ts desc);
   alter table feed_events enable row level security;
   create policy "feed is public" on feed_events for select using (true);
   create policy "anyone can post" on feed_events for insert with check (true);
   ```

   (Anon-writable by design for the demo — the Feed is a public social layer, not a money path.)
3. **Publish demo score roots** (so `settle` has TxLINE-owned roots to verify): from repo root
   `pnpm publish-roots` (idempotent; uses the deploy wallet).

## Every demo session

```sh
pnpm keeper      # terminal 1 — locks at kickoff, settles at the final whistle
cd app && pnpm dev   # terminal 2 — http://localhost:3000
```

If the keeper isn't running, nothing Locks or Settles — start it first.

## 3-minute walkthrough

1. **Sign in** with an email (Privy embedded wallet — no seed phrase, ADR-0005). Hit
   **Get test funds** (0.05 SOL + 100 USDC).
2. **Create a Group** ("New Group"), open **Invite**, copy the link — open it in a second
   browser/profile to show two members in the same Group, presence "2 ONLINE NOW", and the
   shared Group Feed.
3. **Create a Pool** (Match Winner on the demo Fixture; kickoff auto-set ~90s out) and have
   both users **back different Outcomes**. Point at the Reference Odds (StablePrice) and the
   Feed auto-posting each Entry.
4. **Kickoff (~90s)** — the keeper Locks the Pool; the Feed posts the lock + match events;
   the live strip shows the scoreline.
5. **Full time** — keeper submits the Score Proof; Pool Settles; the winner's payout
   auto-claims. Open the **Proof Receipt**: proven stats, score root, Merkle path, settle tx —
   "nobody, including us, chose this outcome."

## Known demo caveats

- Groups/membership are client-side (localStorage); the invite link shares Pools + Feed, and
  presence is real, but there is no on-chain membership roster.
- Global is a public parimutuel Group — the ADR-0007 P2P order book is not built.
- Settlement verifies our own published root (ADR-0008); adopting TxLINE's real proof is
  ADR-0009 (proposed).
