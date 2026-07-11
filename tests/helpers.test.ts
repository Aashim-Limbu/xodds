import { Keypair } from "@solana/web3.js";
import { beforeAll, describe, expect, it } from "vitest";
import { currentUnixTimestamp, setUnixTimestamp } from "./helpers/clock.js";
import { bootHarness, type Harness } from "./helpers/svm.js";
import { createUsdcMint, fundSol, fundUsdc, tokenBalance } from "./helpers/token.js";

describe("test harness helpers", () => {
  let h: Harness;

  beforeAll(async () => {
    h = await bootHarness();
  });

  it("mints test USDC and funds N User wallets with a chosen balance", async () => {
    const mint = await createUsdcMint(h.context);
    const users = [Keypair.generate(), Keypair.generate(), Keypair.generate()];
    const amount = 1_000_000n; // 1 USDC (6 decimals)

    const atas = [];
    for (const u of users) {
      await fundSol(h.context, u.publicKey, 1_000_000_000); // 1 SOL for fees
      atas.push(await fundUsdc(h.context, mint, u.publicKey, amount));
    }

    for (const ata of atas) {
      expect(await tokenBalance(h.context, ata)).toBe(amount);
    }
  });

  it("advances the SVM clock to a chosen unix timestamp", async () => {
    const target = 1_780_000_000; // arbitrary future instant
    await setUnixTimestamp(h.context, target);
    expect(await currentUnixTimestamp(h.context)).toBe(target);
  });
});
