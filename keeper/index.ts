import { readFileSync } from "node:fs";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair } from "@solana/web3.js";
import idl from "../target/idl/finalwhistle.json";
import type { Finalwhistle } from "../target/types/finalwhistle.js";
import { Keeper } from "./keeper.js";
import { StandInTxLine } from "./txline.js";

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

function main() {
  const connection = new Connection(RPC_URL, "confirmed");
  const wallet = new Wallet(loadKeypair(KEYPAIR_PATH));
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const program = new Program<Finalwhistle>(idl as Finalwhistle, provider);

  const keeper = new Keeper(program, new StandInTxLine());
  keeper.runLoop(POLL_MS);
}

main();
