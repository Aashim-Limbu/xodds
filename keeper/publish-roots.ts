import { readFileSync } from "node:fs";
import { AnchorProvider, BN, Program, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, SystemProgram } from "@solana/web3.js";
import idl from "./idl/txline_mock.json";
import type { TxlineMock } from "./idl/txline_mock.js";
import { buildScoreProof, scoresRootPda } from "./merkle.js";
import { StandInTxLine } from "./txline.js";

// Demo-ops: simulate TxLINE publishing its `daily_scores_roots`. For each finalised
// Fixture in the demo slate, compute the ADR-0008 score root (over the same stats the
// Keeper will prove) and write it into the txline_mock program's per-Fixture PDA — so the
// Keeper's `settle` has a real, TxLINE-owned root to verify against. Run once before
// letting the Keeper settle. In production, real TxLINE does this; the Keeper only reads.
const RPC_URL = process.env.KEEPER_RPC_URL ?? "https://api.devnet.solana.com";
const KEYPAIR_PATH = process.env.KEEPER_KEYPAIR ?? `${process.env.HOME}/.config/solana/id.json`;

function loadKeypair(path: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))));
}

async function main() {
  const connection = new Connection(RPC_URL, "confirmed");
  const wallet = new Wallet(loadKeypair(KEYPAIR_PATH));
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const program = new Program<TxlineMock>(idl as TxlineMock, provider);

  const txline = new StandInTxLine();
  for (const fixtureId of txline.finalisedFixtureIds()) {
    const stats = txline.stats(fixtureId)!;
    const { root } = buildScoreProof(stats, txline.siblings(fixtureId));
    await program.methods
      .publishRoot(new BN(fixtureId.toString()), Array.from(root))
      .accountsPartial({
        scoresRoot: scoresRootPda(fixtureId),
        publisher: wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log(`published root for fixture ${fixtureId} -> ${scoresRootPda(fixtureId).toBase58()}`);
  }
  console.log("done");
}

main();
