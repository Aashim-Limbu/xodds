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
- [x] Task 1: complete (commits dfd3894..d0f0820, review clean, browser checks A+B passed)
- [x] Task 2: complete (commits d0f0820..66ee7be, review clean)
- [x] Task 3: complete (commits 66ee7be..1581b00, review clean; browser checks 1+4 verified, 2+3 (reveal beats, reduced-motion) NOT human-confirmed)
- [x] Task 4: complete (commits 1581b00..a0daf6f, review clean after copy fix)

## Minor findings (for final review triage)
- Task 2 report (.superpowers/sdd/task-2-report.md:6,41) misdescribes radix-ui provenance as pre-existing; it was newly added. Code correct, report wrong.
- Task 3 (globals.css collapsible block): reduced-motion path covers [data-state=open] only; close snaps. Asymmetric, low priority.
- Task 3 (ProofReceipt CollapsibleTrigger): label always "Show proof detail", no "Hide" when expanded. aria-expanded is correct regardless.
- RESOLVED (a0daf6f): " wins" suffix dropped from both SettledPool and ProofReceipt headlines.
- Checks 2+3 for Task 3 (three-beat reveal, reduced-motion) never human-confirmed; legacy.css untouched + all hooks verified present, so risk is low but unproven.
- Task 4 (PoolView.tsx): file grew 350->356 despite the extraction; net of a ~22-line early-return wrapper vs deleted branches. Not duplication, but not the predicted shrink either.
