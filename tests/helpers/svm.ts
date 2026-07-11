import { Program } from "@coral-xyz/anchor";
import { BankrunProvider } from "anchor-bankrun";
import { startAnchor, type ProgramTestContext } from "solana-bankrun";
import type { Finalwhistle } from "../../target/types/finalwhistle.js";
import idl from "../../target/idl/finalwhistle.json";

export interface Harness {
  context: ProgramTestContext;
  provider: BankrunProvider;
  program: Program<Finalwhistle>;
}

/**
 * Boot the finalwhistle program inside an in-process SVM (bankrun) — no external
 * validator. `startAnchor("")` reads Anchor.toml and loads target/deploy/finalwhistle.so
 * at the program id from the IDL. This is the single test seam every on-chain ticket uses.
 */
export async function bootHarness(): Promise<Harness> {
  const context = await startAnchor("", [], []);
  const provider = new BankrunProvider(context);
  const program = new Program<Finalwhistle>(idl as Finalwhistle, provider);
  return { context, provider, program };
}
