// Map raw Anchor / Solana / wallet errors to plain language a non-crypto fan can act on.
// PRODUCT.md forbids leaking chain jargon ("AccountNotInitialized", hex custom errors) to the
// user — every money-path catch runs through friendlyError().
// ponytail: substring match on the stringified error — enough for the handful of expected
// failures; anything unrecognised falls back to a generic, non-scary message.

const RULES: [needles: string[], message: string][] = [
  [["user rejected", "rejected the request", "user denied", "request cancelled"], "Request cancelled."],
  [
    ["found no record of a prior credit", "insufficient lamports", "debit an account but found"],
    "You need a little devnet SOL for network fees — tap “Get test funds”.",
  ],
  [["insufficient funds", "insufficientfunds"], "Not enough USDC — tap “Get test funds” to top up."],
  [["pool is not open", "poolnotopen"], "This Pool is closed for Entries."],
  [["kickoff time has not been reached"], "Too early — the match hasn’t kicked off yet."],
  [["grace window"], "Not yet — the settlement grace window hasn’t elapsed."],
  [["winning outcome"], "This Entry isn’t on the winning Outcome."],
  [["accountnotinitialized", "account does not exist"], "Nothing left to claim here."],
  [["amount must be greater than zero", "enter a valid amount"], "Enter an amount greater than zero."],
];

function stringifyError(e: unknown): string {
  if (!e) return "";
  const parts: string[] = [];
  if (e instanceof Error) parts.push(e.message);
  const anyE = e as { logs?: string[]; error?: { errorCode?: { code?: string }; errorMessage?: string } };
  if (anyE.error?.errorCode?.code) parts.push(anyE.error.errorCode.code);
  if (anyE.error?.errorMessage) parts.push(anyE.error.errorMessage);
  if (Array.isArray(anyE.logs)) parts.push(anyE.logs.join(" "));
  if (parts.length === 0) parts.push(String(e));
  return parts.join(" | ").toLowerCase();
}

export function friendlyError(e: unknown): string {
  const raw = stringifyError(e);
  for (const [needles, message] of RULES) {
    if (needles.some((n) => raw.includes(n))) return message;
  }
  return "Something went wrong. Please try again.";
}
