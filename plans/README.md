# Animation plans

Prioritized, self-contained animation improvement plans. Each is written for an
executor with zero context — run with any agent, or `improve-animations execute <plan>`.

| # | Plan | Severity | Status |
|---|------|----------|--------|
| 001 | [Reveal the Proof Receipt as a designed moment](001-proof-receipt-reveal.md) | HIGH | DONE |
| 002 | Feed message entrance — subtle `translateY(4px)`+fade, 150ms (`globals.css` `.feed-msg/.feed-system/.feed-reaction`) | LOW | DONE |
| 003 | Pot-share bar fills via `scaleX` transition, 400ms (`PoolView.tsx` inline style + `.pot-share-bar`) | LOW | DONE |
| 004 | Winner card `winner-pop` + badge `scale(0.85)→1` at settle (`.outcome.win`, `.outcome .badge.settled`) | LOW | DONE |
| 005 | "Paid $X" note `translateY(6px)`+fade, 280ms (`.entry-note`) | LOW | DONE |

002–005 were the subtle-polish rows from the sweep; small enough to implement
directly rather than write separate plan files. All share the `--ease-out` token
added by 001 and are gated on `prefers-reduced-motion: no-preference` (they appear
instantly under reduced motion).

## Recommended execution order

1. **001** — the highest-leverage motion in the product (the app's signature
   settlement reveal). Standalone, no dependencies. **Done.**
2. **002–005** — subtle polish, each independent. **Done.**

## Dependencies

- 001 adds a shared `--ease-out` token to `:root` in `app/app/globals.css`. Any
  future plan should reuse that token rather than redefining the curve.
