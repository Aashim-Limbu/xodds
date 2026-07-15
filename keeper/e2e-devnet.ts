import { readFileSync } from "node:fs";
import { AnchorProvider, BN, Program, Wallet } from "@coral-xyz/anchor";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import idl from "../target/idl/finalwhistle.json";
import type { Finalwhistle } from "../target/types/finalwhistle.js";
import { buildScoreProof, scoresRootPda } from "./merkle.js";
import { StandInTxLine } from "./txline.js";

// Headless end-to-end smoke against the DEPLOYED devnet programs: create a Pool, place an
// Entry, Lock, Settle (verifying a txline_mock-published root), and claim the payout —
// proving the full on-chain loop and the settlement trust boundary work live, not just in
// bankrun. Uses the deploy wallet (funded + USDC mint authority) as the single player.
const RPC = process.env.KEEPER_RPC_URL ?? "https://api.devnet.solana.com";
const KEYPAIR = process.env.KEEPER_KEYPAIR ?? `${process.env.HOME}/.config/solana/id.json`;
const USDC_MINT = new PublicKey("3nHewKXJ7g1jAcbcezcShvhmi6vF2rJ57yrjo32iGv6M");
const FIXTURE = 1002n; // StandInTxLine result: 2-0 -> home win (Outcome 0)

function u64le(v: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(v);
  return b;
}
const load = (p: string) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, "utf8"))));

async function main() {
  const connection = new Connection(RPC, "confirmed");
  const kp = load(KEYPAIR);
  const wallet = new Wallet(kp);
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const program = new Program<Finalwhistle>(idl as Finalwhistle, provider);
  const me = wallet.publicKey;
  const PID = program.programId;

  const group = PID; // app default
  const nonce = BigInt(Math.floor(Date.now() / 1000) % 1_000_000); // unique per run
  const pool = PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), group.toBuffer(), u64le(FIXTURE), Buffer.from([0]), u64le(nonce)],
    PID,
  )[0];
  const escrow = PublicKey.findProgramAddressSync([Buffer.from("escrow"), pool.toBuffer()], PID)[0];
  const entry = PublicKey.findProgramAddressSync(
    [Buffer.from("entry"), pool.toBuffer(), me.toBuffer(), Buffer.from([0])],
    PID,
  )[0];
  const myUsdc = getAssociatedTokenAddressSync(USDC_MINT, me);

  // Fund self with test USDC (deploy wallet is the mint authority).
  const fund = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(me, myUsdc, me, USDC_MINT),
    createMintToInstruction(USDC_MINT, myUsdc, me, 10_000_000n),
  );
  await provider.sendAndConfirm(fund);
  const before = (await getAccount(connection, myUsdc)).amount;

  // create -> enter -> lock (kickoff in the past so it locks immediately)
  const kickoff = Math.floor(Date.now() / 1000) - 5;
  await program.methods
    .createPool(group, new BN(FIXTURE.toString()), { matchWinner: {} }, new BN(nonce.toString()), new BN(kickoff), 0)
    .accountsPartial({ pool, escrow, usdcMint: USDC_MINT, creator: me, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId })
    .rpc();
  console.log("created Pool", pool.toBase58());

  await program.methods
    .placeEntry(0, new BN(5_000_000))
    .accountsPartial({ pool, entry, escrow, userUsdc: myUsdc, user: me, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId })
    .rpc();
  console.log("placed Entry: 5 USDC on Outcome 0 (home win)");

  await program.methods.lock().accountsPartial({ pool, signer: me }).rpc();
  console.log("Locked");

  // settle with the proof, verified against the txline_mock-published root
  const txline = new StandInTxLine();
  const { proof } = buildScoreProof(txline.stats(FIXTURE)!, txline.siblings(FIXTURE));
  await program.methods
    .settle(proof as never)
    .accountsPartial({ pool, scoresRoot: scoresRootPda(FIXTURE), signer: me })
    .rpc();
  const settled = await program.account.pool.fetch(pool);
  console.log("Settled — winningOutcome:", settled.winningOutcome, "state:", Object.keys(settled.state)[0]);

  await program.methods
    .claimPayout()
    .accountsPartial({ pool, entry, escrow, userUsdc: myUsdc, user: me, tokenProgram: TOKEN_PROGRAM_ID })
    .rpc();
  const after = (await getAccount(connection, myUsdc)).amount;
  console.log(`claimed payout: balance ${before} -> ${after} (delta ${after - before}, should be ~0 net: paid 5, won 5 back)`);
  console.log("E2E OK ✅  pool:", pool.toBase58());
}

main();
