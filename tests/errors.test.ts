import { describe, expect, it } from "vitest";
import { friendlyError } from "../app/lib/errors";

// friendlyError must never leak chain jargon to a non-crypto fan (PRODUCT.md) and must map the
// handful of expected money-path failures to something actionable.
describe("friendlyError", () => {
  it("maps SPL insufficient-funds to a USDC top-up hint", () => {
    const e = new Error("Transaction simulation failed: Error: insufficient funds");
    expect(friendlyError(e)).toMatch(/USDC/);
  });

  it("maps no-SOL-for-fees to a Get test funds hint", () => {
    const e = new Error("Attempt to debit an account but found no record of a prior credit.");
    expect(friendlyError(e)).toMatch(/SOL/);
  });

  it("maps an Anchor error code (AccountNotInitialized) via the structured field", () => {
    const e = { error: { errorCode: { code: "AccountNotInitialized" }, errorMessage: "The program expected this account to be already initialized" } };
    expect(friendlyError(e)).toBe("Nothing left to claim here.");
  });

  it("maps a closed-Pool custom error", () => {
    expect(friendlyError(new Error("Pool is not Open"))).toBe("This Pool is closed for Entries.");
  });

  it("never returns the raw hex/jargon for an unrecognised error", () => {
    const out = friendlyError(new Error("0x1771 custom program error"));
    expect(out).toBe("Something went wrong. Please try again.");
  });
});
