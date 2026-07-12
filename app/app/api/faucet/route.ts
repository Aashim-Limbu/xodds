import { readFileSync } from "node:fs";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { NextResponse } from "next/server";

// Demo faucet: gives a signed-in User a little SOL (for tx fees), creates their USDC
// account, and mints test USDC into it. Runs server-side only so the minter key never
// reaches the browser. FAUCET_KEYPAIR must be the USDC mint authority AND hold some SOL
// (the deploy wallet is both) — set it in .env.local (no NEXT_PUBLIC prefix).
const RPC = process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";
const SOL_DROP = 0.05 * 1_000_000_000; // 0.05 SOL for fees
const USDC_DROP = 100_000_000n; // 100 USDC (6 decimals)

function faucetKeypair(): Keypair {
  const path = process.env.FAUCET_KEYPAIR;
  if (!path) throw new Error("FAUCET_KEYPAIR not set");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))));
}

export async function POST(req: Request): Promise<Response> {
  try {
    const mintStr = process.env.NEXT_PUBLIC_USDC_MINT;
    if (!mintStr) throw new Error("NEXT_PUBLIC_USDC_MINT not set");
    const { address } = (await req.json()) as { address?: string };
    if (!address) return NextResponse.json({ error: "address required" }, { status: 400 });

    const owner = new PublicKey(address);
    const mint = new PublicKey(mintStr);
    const connection = new Connection(RPC, "confirmed");
    const faucet = faucetKeypair();
    const ata = getAssociatedTokenAddressSync(mint, owner);

    const tx = new Transaction().add(
      SystemProgram.transfer({ fromPubkey: faucet.publicKey, toPubkey: owner, lamports: SOL_DROP }),
      createAssociatedTokenAccountIdempotentInstruction(faucet.publicKey, ata, owner, mint),
      createMintToInstruction(mint, ata, faucet.publicKey, USDC_DROP),
    );
    const signature = await connection.sendTransaction(tx, [faucet]);
    await connection.confirmTransaction(signature, "confirmed");

    return NextResponse.json({ ata: ata.toBase58(), signature });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
