# Settle Revamp — progress ledger

Plan: docs/superpowers/plans/2026-07-17-settle-revamp.md
Branch: settle-revamp (cut from b219c41 = origin/main)
Base commit: 2c32ee7 (plan commit; task work starts after this)

## Decisions binding every task
- Plan governs over the TDD rubric: the app has NO component test infra and this
  plan adds none. Absent component tests are NOT a review finding. Verification is
  browser-based. Root `tests/*.test.ts` are bankrun/SVM program tests, untouched.
- Browser checks are run by the human at each task gate, not by subagents.
- Devnet e2e (`pnpm tsx keeper/e2e-devnet.ts`) is runnable — user has the deploy wallet.

## Tasks
- [ ] Task 1: Tailwind v4 coexistence infrastructure
- [ ] Task 2: Retheme'd shadcn primitives
- [ ] Task 3: ProofReceipt receipt-first rewrite
- [ ] Task 4: SettledPool payout hero

## Minor findings (for final review triage)
(none yet)
