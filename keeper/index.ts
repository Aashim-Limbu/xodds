import { readFileSync } from "node:fs";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair } from "@solana/web3.js";
import idl from "../target/idl/finalwhistle.json";
import type { Finalwhistle } from "../target/types/finalwhistle.js";
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
  const apiToken = process.env.TXLINE_API_TOKEN;
  if (!apiToken) return new StandInTxLine();
  const origin = process.env.TXLINE_ORIGIN;
  const jwt = process.env.TXLINE_JWT ?? (await guestAuth(origin));
  const slate = (process.env.TXLINE_FIXTURES ?? "").split(",").map((s) => s.trim()).filter(Boolean).map(BigInt);
  console.log(`[keeper] using real TxLINE feed for fixtures [${slate.join(", ")}]`);
  return new RealTxLine({ jwt, apiToken, origin }, slate);
}

async function main() {
  const connection = new Connection(RPC_URL, "confirmed");
  const wallet = new Wallet(loadKeypair(KEYPAIR_PATH));
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const program = new Program<Finalwhistle>(idl as Finalwhistle, provider);

  const keeper = new Keeper(program, await chooseTxLine());
  keeper.runLoop(POLL_MS);
}

void main();
