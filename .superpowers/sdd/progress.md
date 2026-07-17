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

## Final whole-branch review (opus) — findings + resolution
- CRITICAL: legacy .proven-panel/.proven-word leaked flex-direction/border-right/color:#fff/rotate/text-shadow into the new header (white-on-yellow 1.3:1). FIXED 6139829 via motion-only .reveal-* hooks.
- IMPORTANT: Alert bg-card (utilities) beat .verify-ok tint (legacy) -> banner never tinted. FIXED 6139829 (variants carry tints).
- IMPORTANT: PoolView used className="pool-view" which does not exist; settled screen lost the Feed rail. FIXED 6139829 -> pool-layout.
- IMPORTANT: SettledPool headline gated on unused `fixture` prop -> blank while fixtures hydrate. FIXED 6139829.
- IMPORTANT: Alert variants were three identical no-ops. FIXED 6139829.
- MINOR: role="status" on failed proof. FIXED 6139829 -> role=alert when !ok.
- MINOR: lucide-react unused. FIXED 6139829 (removed).
- MINOR: font-token collision with next/font undocumented. FIXED 6139829 (comment added).
- ACCEPTED/DEFERRED: orphaned legacy CSS (.outcome.win, .verify-ok, .proven-word) left in place - legacy.css is not edited by this plan; delete during the 17-component migration.
- ACCEPTED: reduce close-snap; always-"Show proof detail" label (aria-expanded correct, span is aria-hidden); PoolView 350->356 (not duplication).
- SPEC DEVIATION (accepted): spec 2.1 named the final score in the Result beat; it lives in the receipt one card down instead. Spec should be amended rather than the code.

## Verified after fix (headless screenshot + DOM, 6139829)
- Header horizontal, ink-on-yellow, no border-right. Verify banner green-tinted. Headline "FRANCE WIN". Detail collapsed, no hex. Zero legacy leak classes in DOM.
- STILL UNCONFIRMED BY HUMAN: three-beat reveal timing + reduced-motion path.
- Re-review of 6139829 (sonnet): APPROVED. All 7 findings fixed; .reveal-* motion values verified byte-for-byte vs legacy.css:953-981; no visual props leaked into the motion hooks; legacy.css untouched; no logic drift.

