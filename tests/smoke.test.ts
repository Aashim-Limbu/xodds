import { BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { beforeAll, describe, expect, it } from "vitest";
import { bootHarness, type Harness } from "./helpers/svm.js";

describe("smoke: program boots in the SVM and an instruction takes effect", () => {
  let h: Harness;

  beforeAll(async () => {
    h = await bootHarness();
  });

  it("initializes the Beacon account and stores the caller's value", async () => {
    const [beacon] = PublicKey.findProgramAddressSync(
      [Buffer.from("beacon")],
      h.program.programId,
    );

    await h.program.methods
      .initialize(new BN(42))
      .accountsPartial({
        beacon,
        payer: h.provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const account = await h.program.account.beacon.fetch(beacon);
    expect(account.value.toNumber()).toBe(42);
  });
});
