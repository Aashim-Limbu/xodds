# Settle Revamp — Design

Date: 2026-07-17
Status: Approved (design), pending implementation plan

## Problem

Once a Pool settles, the UI contradicts three of the product's own principles.

**Settlement is not a designed moment, it is a badge.** `PoolView` renders the same
outcome grid for a settled Pool as for an open market, adding only a `Winner` chip
(`components/PoolView.tsx:250-262`). The final whistle lands as a CSS class.

**The receipt is a data-wall, not a hero.** `ProofReceipt` is appended below the grid
(`components/PoolView.tsx:342-344`) and surfaces hex score roots, a Merkle path, and a
transaction signature by default (`components/ProofReceipt.tsx:153-190`) — the "cold
trading terminal" the product's anti-references reject, aimed at a fan who is never
supposed to see a hex address.

**The payout is buried.** `Claim $X` is one button in a stack, rendered *below*
"Run it back" (`components/PoolView.tsx:326-338`).

## Decisions

Settled Pool becomes **receipt-first**: the market grid is dropped, the payout is the
single primary action, and the Proof Receipt is the centerpiece. Cryptographic detail
collapses behind a disclosure. The visual identity stays neo-brutalist; shadcn is
retheme'd to match, not adopted at its defaults.

## 1. Stack Infrastructure

Tailwind v4, CSS-first. No `tailwind.config.js`. The existing `:root` tokens in
`app/globals.css` are mapped into the Tailwind theme via `@theme`, so the brutalist
tokens remain the single source of truth rather than being duplicated:

```css
@import "tailwindcss";
@theme {
  --color-primary: var(--yellow);
  --color-ink: var(--ink);
  --radius: 8px;
  --shadow-brut: 4px 4px 0 0 var(--ink);
}
```

New dependencies: `tailwindcss`, `@tailwindcss/postcss`, `clsx`, `tailwind-merge`,
`lucide-react`, `@radix-ui/react-collapsible`. New files: `postcss.config.mjs`,
`lib/utils.ts` (`cn`), `components.json`.

The existing 1,366 lines of `app/globals.css` are **not** deleted or rewritten. The
other ~17 components keep rendering from it while Tailwind runs alongside; they migrate
in follow-up work. Only `@shadcn` is a configured registry, so primitives come from
there and are retheme'd by hand: `button`, `card`, `badge`, `collapsible`, `separator`,
`alert`, `skeleton`. Each is overridden to hard offset shadow, square-ish radius, and
the deep yellow, so a `<Button>` renders as the current button does.

## 2. Settled Pool — `components/SettledPool.tsx` (new)

`PoolView` branches to this component at `pool.state === "settled"`; the outcome grid is
not rendered. Reading order:

1. **Result** — final score, `{Winner} wins`, and the viewer's position
   (`You backed Brazil · $10`).
2. **Payout** — `Claim $24.50` as the single primary CTA. A losing Member gets an honest
   line, not a disabled button. The `paid` state persists after claiming.
3. **Proof Receipt** — directly beneath the payout.
4. **Run it back** — demoted to a secondary action.

This moves the settled-only branching (~60 lines) out of `PoolView`, which is 350 lines
today. Both files shrink.

Pool state continues to carry a text label alongside colour, per the accessibility
requirement — state is never signalled by colour alone.

## 3. ProofReceipt — rewrite

A Card holding: the 🏆 Proven panel, the score line, the winning Outcome, then the
`Verified in your browser` alert as the trust payload — this is where a mainstream fan
stops reading. The stats grid (proven score, winning Outcome, corners, cards) stays
visible.

The score root, Merkle path, and settlement transaction move into a `<Collapsible>`
labelled **"Check it yourself"**, collapsed by default.

**Failure exception:** when `verifyScoreProof` returns `ok: false`, the collapsible is
force-opened with the mismatched root visible and the failure styling intact. A failed
proof is never hidden behind a disclosure.

## 4. Reuse

`app/receipt/[pool]/page.tsx` renders the same `ProofReceipt`. There is no fork — both
the in-app settled Pool and the public share page revamp from one component.

`verifyScoreProof`, `useFixtures`, `fetchSettlement`, and the claim path are untouched.
This change is presentation only; no money logic moves.

## 5. Motion

The dominant motion risk in this revamp is **deletion by omission, not absence**. The
settled surfaces already carry the right motion; the rewrite orphans the selectors it
hangs on. Three of the four items below are preservation.

**5.1 — Preserve the settlement reveal (`app/globals.css:953-982`).** The staggered
`@starting-style` entrance is documented in its own comment as "the app's signature
settlement moment (PRODUCT.md)". It is wired to `.proven-panel .sticker`,
`.receipt-body`, and `.verify` — class selectors on ProofReceipt's *current* markup.
Section 3's rewrite stops them matching, killing the reveal with no error, no test
failure, and nothing in the diff resembling a deletion. Keep the three beats exactly:
sticker `420ms var(--ease-out)` from `scale(1.15) rotate(-6deg)`; `.receipt-body`
`300ms` delay `60ms` from `translateY(8px)`; `.verify` `260ms` delay `220ms` from
`scale(0.9)`. Keep the `prefers-reduced-motion: reduce` block intact: `opacity 200ms
ease`, no transform, no stagger. Keep this as plain CSS on stable class hooks rather
than porting to utilities.

**5.2 — Animate the new Collapsible.** Radix ships unstyled, so "Check it yourself"
would snap. `height` + `opacity` at `200ms var(--ease-out)` over
`--radix-collapsible-content-height`. Under `reduce`: `opacity 150ms ease`, no height
animation.

**5.3 — Preserve the payout entrance (`app/globals.css:997-1004`).** The `SettledPool`
extraction orphans `.entry-note`. Port as-is: `transform, opacity 280ms var(--ease-out)`,
`@starting-style` from `translateY(6px)`. Per "earn trust on every money move", the paid
confirmation stays standard, not celebratory — do not upgrade it.

**5.4 — Keep the skeleton in a sibling branch.** The reveal in 5.1 fires because nodes
are freshly inserted when `loading` flips false. If the new shadcn `skeleton` renders in
the same subtree position as the resolved receipt, `@starting-style` will not re-trigger
and the reveal is lost a second way.

**Deliberately not animated:** the stats grid (proven data a Member reads — staggering
evidence undermines it); a celebration/confetti beat (the Pool has losers; "nobody,
including us, chose this" means the app does not take the winner's side); winner
emphasis in the Result hero (the old `.outcome.win` pop at `globals.css:985-987` existed
to lead the eye from grid down to receipt — receipt-first makes it redundant, so it dies
with the grid); and the force-opened failure state, which renders already-open and
unanimated rather than performing an expansion.

## 6. Verification

- `tests/settle.test.ts` must still pass.
- `pnpm typecheck` must pass.
- One new check: the receipt renders its proof detail collapsed by default, and
  force-opens when `check.ok === false`.
- The settlement reveal (5.1) still fires after the rewrite — the regression this spec
  is most likely to ship silently.

## Out of Scope

- Dark mode — no dark tokens exist today.
- Migrating the other ~17 components off `globals.css`.
- A settlement celebration/reveal animation (receipt-first was chosen over the
  celebration-reveal option). Note this means *no new* reveal is designed — the existing
  reveal at `globals.css:953-982` is preserved, per section 5.1.
