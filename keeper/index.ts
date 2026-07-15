import { readFileSync } from "node:fs";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair } from "@solana/web3.js";
import idl from "./idl/finalwhistle.json";
import type { Finalwhistle } from "./idl/finalwhistle.js";
import mockIdl from "./idl/txline_mock.json";
import type { TxlineMock } from "./idl/txline_mock.js";
import { Keeper } from "./keeper.js";
import { StandInTxLine, type TxLineClient } from "./txline.js";
import { guestAuth, RealTxLine } from "./txline-live.js";

// Config from env — the Keeper needs a funded keypair to pay tx fees (it holds no
// authority; anyone could run this).
const RPC_URL = process.env.KEEPER_RPC_URL ?? "https://api.devnet.solana.com";
const KEYPAIR_PATH = process.env.KEEPER_KEYPAIR ?? `${process.env.HOME}/.config/solana/id.json`;
const rawPoll = Number(process.env.KEEPER_POLL_MS ?? 15_000);
const POLL_MS = Number.isFinite(rawPoll) && rawPoll > 0 ? rawPoll : 15_000;

function loadKeypair(path: string): Keypair {
  const secret = Uint8Array.from(JSON.parse(readFileSync(path, "utf8")));
  return Keypair.fromSecretKey(secret);
}

// Use the real TxLINE devnet scores feed when an activated API token is present (see
// keeper/txline-live.ts for the one-time subscribe/activate flow); otherwise the scripted
// StandIn, so the demo runs with no credentials. Settlement stays on our own root either way.
async function chooseTxLine(): Promise<TxLineClient> {
  // `|| undefined` (not ??): unset GitHub Actions secrets arrive as empty strings, which
  // must fall back exactly like a missing var.
  const apiToken = process.env.TXLINE_API_TOKEN || undefined;
  if (!apiToken) return new StandInTxLine();
  const origin = process.env.TXLINE_ORIGIN || undefined;
  const jwt = process.env.TXLINE_JWT || (await guestAuth(origin));
  console.log("[keeper] using real TxLINE feed");
  return new RealTxLine({ jwt, apiToken, origin });
}

async function main() {
  const connection = new Connection(RPC_URL, "confirmed");
  const wallet = new Wallet(loadKeypair(KEYPAIR_PATH));
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const program = new Program<Finalwhistle>(idl as Finalwhistle, provider);
  const mock = new Program<TxlineMock>(mockIdl as TxlineMock, provider);

  const keeper = new Keeper(program, await chooseTxLine(), undefined, mock);
  if (process.argv.includes("--once")) {
    // One tick and exit — for cron hosting (GitHub Actions / any scheduler).
    const taken = await keeper.tick();
    console.log(`[keeper] once: ${taken.length} action(s)`);
    return;
  }
  keeper.runLoop(POLL_MS);
}

void main();
