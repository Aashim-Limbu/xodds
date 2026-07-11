import {
  createAssociatedTokenAccountInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  unpackAccount,
} from "@solana/spl-token";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  type AccountInfo,
} from "@solana/web3.js";
import type { ProgramTestContext } from "solana-bankrun";

const USDC_DECIMALS = 6;

async function sendTx(
  context: ProgramTestContext,
  feePayer: Keypair,
  ixs: Transaction["instructions"],
  extraSigners: Keypair[] = [],
): Promise<void> {
  const tx = new Transaction();
  tx.add(...ixs);
  tx.recentBlockhash = context.lastBlockhash;
  tx.feePayer = feePayer.publicKey;
  tx.sign(feePayer, ...extraSigners);
  await context.banksClient.processTransaction(tx);
}

/**
 * Create a USDC-like SPL mint (6 decimals) with `context.payer` as mint authority.
 * Returns the mint address. Mirrors real USDC so Pool escrow math is realistic.
 */
export async function createUsdcMint(context: ProgramTestContext): Promise<PublicKey> {
  const payer = context.payer;
  const mint = Keypair.generate();
  const rent = await context.banksClient.getRent();
  const lamports = Number(rent.minimumBalance(BigInt(MINT_SIZE)));
  await sendTx(
    context,
    payer,
    [
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: mint.publicKey,
        lamports,
        space: MINT_SIZE,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMint2Instruction(mint.publicKey, USDC_DECIMALS, payer.publicKey, null),
    ],
    [mint],
  );
  return mint.publicKey;
}

/**
 * Give `owner` an associated USDC account funded with `amount` base units.
 * Returns the ATA. `context.payer` pays fees and signs the mint.
 */
export async function fundUsdc(
  context: ProgramTestContext,
  mint: PublicKey,
  owner: PublicKey,
  amount: bigint,
): Promise<PublicKey> {
  const payer = context.payer;
  const ata = getAssociatedTokenAddressSync(mint, owner, true);
  await sendTx(context, payer, [
    createAssociatedTokenAccountInstruction(payer.publicKey, ata, owner, mint),
    createMintToInstruction(mint, ata, payer.publicKey, amount),
  ]);
  return ata;
}

/** Fund a fresh wallet with SOL (lamports) so it can sign its own transactions. */
export async function fundSol(
  context: ProgramTestContext,
  owner: PublicKey,
  lamports: number,
): Promise<void> {
  const payer = context.payer;
  await sendTx(context, payer, [
    SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: owner, lamports }),
  ]);
}

/** Read an SPL token account's balance (base units). Returns 0n if the account is absent. */
export async function tokenBalance(
  context: ProgramTestContext,
  tokenAccount: PublicKey,
): Promise<bigint> {
  const raw = await context.banksClient.getAccount(tokenAccount);
  if (!raw) return 0n;
  const info: AccountInfo<Buffer> = {
    executable: raw.executable,
    owner: new PublicKey(raw.owner),
    lamports: Number(raw.lamports),
    data: Buffer.from(raw.data),
    rentEpoch: Number(raw.rentEpoch),
  };
  return unpackAccount(tokenAccount, info, TOKEN_PROGRAM_ID).amount;
}
