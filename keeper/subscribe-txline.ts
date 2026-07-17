import { readFileSync } from "node:fs";
import { AnchorProvider, Program, Wallet, type Idl } from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import nacl from "tweetnacl";
import txoracleIdl from "./idl/txoracle.json";

// One-shot ops script: subscribe this wallet to TxLINE's FREE World Cup tier on devnet
// (service level 1, 4 weeks, zero TxL — just tx fees), then activate and print the API
// token. Re-run every 4 weeks when access expires. Docs: txline-docs.txodds.com worldcup.
//
//   KEEPER_KEYPAIR=~/.config/solana/id.json pnpm tsx keeper/subscribe-txline.ts

const RPC_URL = process.env.KEEPER_RPC_URL ?? "https://api.devnet.solana.com";
const KEYPAIR_PATH = process.env.KEEPER_KEYPAIR ?? `${process.env.HOME}/.config/solana/id.json`;
const ORIGIN = process.env.TXLINE_ORIGIN ?? "https://txline-dev.txodds.com";
const TXL_MINT = new PublicKey("4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG"); // devnet TxL (Token-2022)
const SERVICE_LEVEL_ID = 1; // free World Cup tier
const DURATION_WEEKS = 4;
const SELECTED_LEAGUES: number[] = []; // standard free bundle

async function main() {
  const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(KEYPAIR_PATH, "utf8"))));
  const connection = new Connection(RPC_URL, "confirmed");
  const provider = new AnchorProvider(connection, new Wallet(payer), { commitment: "confirmed" });
  const program = new Program(txoracleIdl as Idl, provider);
  console.log(`wallet ${payer.publicKey.toBase58()} -> txoracle ${program.programId.toBase58()}`);

  const [tokenTreasuryPda] = PublicKey.findProgramAddressSync([Buffer.from("token_treasury_v2")], program.programId);
  const [pricingMatrix] = PublicKey.findProgramAddressSync([Buffer.from("pricing_matrix")], program.programId);
  const tokenTreasuryVault = getAssociatedTokenAddressSync(
    TXL_MINT, tokenTreasuryPda, true, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  const userTokenAccount = getAssociatedTokenAddressSync(
    TXL_MINT, payer.publicKey, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  const txSig = await program.methods
    .subscribe(SERVICE_LEVEL_ID, DURATION_WEEKS)
    .preInstructions([
      // The program requires the user's TxL ATA to exist even at zero cost (free tier).
      createAssociatedTokenAccountIdempotentInstruction(
        payer.publicKey, userTokenAccount, payer.publicKey, TXL_MINT,
        TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
      ),
    ])
    .accounts({
      user: payer.publicKey,
      pricingMatrix,
      tokenMint: TXL_MINT,
      userTokenAccount,
      tokenTreasuryVault,
      tokenTreasuryPda,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log("subscribe tx:", txSig);

  // Guest JWT, then sign `${txSig}:${leagues}:${jwt}` with the SAME wallet and activate.
  const authRes = await fetch(`${ORIGIN}/auth/guest/start`, { method: "POST" });
  if (!authRes.ok) throw new Error(`guest auth failed: ${authRes.status}`);
  const jwt = ((await authRes.json()) as { token: string }).token;

  const message = new TextEncoder().encode(`${txSig}:${SELECTED_LEAGUES.join(",")}:${jwt}`);
  const walletSignature = Buffer.from(nacl.sign.detached(message, payer.secretKey)).toString("base64");

  const actRes = await fetch(`${ORIGIN}/api/token/activate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({ txSig, walletSignature, leagues: SELECTED_LEAGUES }),
  });
  if (!actRes.ok) throw new Error(`activate failed: ${actRes.status} ${await actRes.text()}`);
  // The endpoint may return the token as raw text or wrapped in JSON.
  const raw = await actRes.text();
  let apiToken = raw.trim();
  try {
    const parsed = JSON.parse(raw) as { token?: string };
    if (parsed.token) apiToken = parsed.token;
  } catch {
    /* raw text token */
  }

  console.log("\nTXLINE_JWT=" + jwt);
  console.log("TXLINE_API_TOKEN=" + apiToken);
  console.log("\nPut both in app/.env.local and the keeper env (valid 4 weeks; JWT 30 days).");
}

void main();
