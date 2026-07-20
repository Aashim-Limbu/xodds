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

// Network mismatch (RPC on one cluster, TxLINE origin on another) is the #1 cause of an
// activation 403, so refuse to submit when they disagree.
// ponytail: string heuristic, not a genesis-hash probe — the origin has no queryable
// cluster and defaults already agree; upgrade only if a URL ever hides its network.
export function clusterOf(url: string): "devnet" | "mainnet" | "unknown" {
  if (/devnet|txline-dev/i.test(url)) return "devnet";
  if (/mainnet|txline\.txodds\.com/i.test(url)) return "mainnet";
  return "unknown";
}

function assertSameCluster(rpc: string, origin: string): void {
  const [r, o] = [clusterOf(rpc), clusterOf(origin)];
  if (r !== "unknown" && o !== "unknown" && r !== o) {
    throw new Error(
      `Network mismatch: RPC looks ${r} (${rpc}) but TxLINE origin looks ${o} (${origin}). ` +
        `Point KEEPER_RPC_URL and TXLINE_ORIGIN at the same cluster.`,
    );
  }
}

async function main() {
  assertSameCluster(RPC_URL, ORIGIN);
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

// SELFTEST=1 pnpm tsx keeper/subscribe-txline.ts — checks the guard, submits nothing.
if (process.env.SELFTEST) {
  const eq = (a: unknown, b: unknown, m: string) => { if (a !== b) throw new Error(`SELFTEST ${m}: ${a} !== ${b}`); };
  eq(clusterOf("https://api.devnet.solana.com"), "devnet", "rpc devnet");
  eq(clusterOf("https://txline-dev.txodds.com"), "devnet", "origin devnet");
  eq(clusterOf("https://api.mainnet-beta.solana.com"), "mainnet", "rpc mainnet");
  eq(clusterOf("https://txline.txodds.com"), "mainnet", "origin mainnet");
  eq(clusterOf("https://my-private-rpc.example"), "unknown", "custom rpc");
  let threw = false;
  try { assertSameCluster("https://api.mainnet-beta.solana.com", "https://txline-dev.txodds.com"); } catch { threw = true; }
  eq(threw, true, "mismatch throws");
  assertSameCluster("https://my-private-rpc.example", "https://txline-dev.txodds.com"); // unknown side passes
  console.log("SELFTEST ok");
} else {
  void main();
}
