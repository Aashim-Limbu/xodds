# 001 — Reveal the Proof Receipt as a designed moment

- **Status**: TODO
- **Commit**: 75aa8a3
- **Severity**: HIGH
- **Category**: Missed opportunity (Purpose & frequency — Rare/first-time delight)
- **Estimated scope**: 1 file (`app/app/globals.css`), ~30 lines added. No JS/markup changes.

## Problem

The Proof Receipt is the app's signature moment. PRODUCT.md is explicit:
"Settlement is a designed moment, not a status change… that reveal is the app's
signature." Today it teleports in with zero ceremony — the component swaps a
loading string for the fully-formed receipt in a single frame:

```tsx
// app/components/ProofReceipt.tsx:60-61 — current
if (loading) return <div className="panel muted">Building Proof Receipt…</div>;
if (!receipt) return <div className="panel muted">No settlement proof found for this Pool.</div>;
```

```tsx
// app/components/ProofReceipt.tsx:85-91 — current (the hero nodes, no motion)
return (
  <div className="receipt-split">
    <div className="proven-panel">
      <span className="sticker" aria-hidden="true">🏆</span>
      <span className="proven-word">Proven</span>
    </div>
    <div className="receipt-body">
```

The 🏆 "Proven" stamp, the "Verified in your browser" ✓ badge, and the whole
receipt body all appear at once, instantly. This is the rarest, highest-emotion
screen in the product (seen once per settled Pool) — the one place the delight
budget is fully allowed — and it currently spends none of it.

The relevant CSS is purely static — no `transition`, no keyframes on any of
these:

```css
/* app/app/globals.css:886-908 — current */
.proven-panel { /* … layout only … */ }
.proven-word { /* … type only … */ }
.proven-panel .sticker { font-size: 72px; filter: drop-shadow(4px 4px 0 rgba(31, 27, 16, 0.35)); }

/* app/app/globals.css:927 — current */
.verify { display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px; border-radius: var(--r-sm); border: 3px solid var(--ink); }
```

## Target

A three-beat reveal, all `transform`/`opacity` only, driven by `@starting-style`
so it needs **no JavaScript or markup change** — the nodes are freshly inserted
when `loading` flips false, which is exactly when `@starting-style` fires.

1. **Trophy stamps in** (like a rubber stamp landing): `scale(1.15) rotate(-6deg)` + `opacity: 0` → settled, `420ms ease-out`.
2. **Receipt body fades up** underneath it: `translateY(8px)` + `opacity: 0` → settled, `300ms ease-out`, `60ms` delay.
3. **Verify badge pops** last, so the eye lands on "Verified in your browser": `scale(0.9)` + `opacity: 0` → settled, `260ms ease-out`, `220ms` delay.

Exact CSS to add (append near the receipt styles, e.g. after `globals.css:934`).
First add the shared easing token to `:root` (see conventions), then:

```css
/* target — the Proof Receipt reveal */
@media (prefers-reduced-motion: no-preference) {
  .proven-panel .sticker {
    transition: transform 420ms var(--ease-out), opacity 420ms var(--ease-out);
  }
  .receipt-body {
    transition: transform 300ms var(--ease-out), opacity 300ms var(--ease-out);
    transition-delay: 60ms;
  }
  .verify {
    transition: transform 260ms var(--ease-out), opacity 260ms var(--ease-out);
    transition-delay: 220ms;
  }
  @starting-style {
    .proven-panel .sticker { opacity: 0; transform: scale(1.15) rotate(-6deg); }
    .receipt-body { opacity: 0; transform: translateY(8px); }
    .verify { opacity: 0; transform: scale(0.9); }
  }
}

/* Reduced motion keeps a gentle bridge — opacity only, no movement, no stagger. */
@media (prefers-reduced-motion: reduce) {
  .proven-panel .sticker, .receipt-body, .verify {
    transition: opacity 200ms ease;
  }
  @starting-style {
    .proven-panel .sticker, .receipt-body, .verify { opacity: 0; }
  }
}
```

Note: `transform-origin: center` (the default) is correct here — the stamp is a
celebration element, not a trigger-anchored popover, so it is exempt from the
"scale from the trigger" rule.

## Repo conventions to follow

- **No easing tokens exist yet.** The repo hand-writes `ease`/`ease-out`. Add one
  shared token to the `:root` block at `app/app/globals.css:1` and use it here:
  ```css
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1); /* strong ease-out for UI entrances */
  ```
- **Animation is always gated on `prefers-reduced-motion`.** Follow the existing
  exemplar exactly — the modal entrance at `app/app/globals.css:987-989`:
  ```css
  @media (prefers-reduced-motion: no-preference) {
    .modal { animation: modal-pop 140ms ease-out; }
    @keyframes modal-pop { from { transform: translateY(8px) scale(0.98); opacity: 0; } to { transform: none; opacity: 1; } }
  }
  ```
  Same wrapper, same `ease-out` feel, same `translateY(8px) + opacity` bridge —
  this plan just extends that established language to the receipt.
- Motion animates `transform`/`opacity` only throughout this repo (see the
  button, pool-card, and modal rules). Do not animate `width`, `height`, colour,
  or `filter`.

## Steps

1. In `app/app/globals.css:1`, inside the existing `:root { … }` block, add the
   line `--ease-out: cubic-bezier(0.23, 1, 0.32, 1);`.
2. After the `.verify-sub` rule (currently `app/app/globals.css:934`), append the
   two `@media` blocks from the **Target** section verbatim.
3. Do not touch `app/components/ProofReceipt.tsx` — the reveal is entirely
   CSS-driven via `@starting-style`; the existing loading→receipt swap is the
   trigger.

## Boundaries

- Do NOT modify `app/components/ProofReceipt.tsx` or any other component. CSS only.
- Do NOT change markup, class names, or structure.
- Do NOT add keyframes for this (use `@starting-style` transitions, so a rapid
  re-mount retargets cleanly instead of restarting a keyframe mid-flight).
- Do NOT add a JS `data-mounted` fallback — `@starting-style` has sufficient
  browser support (Chrome 117+, Safari 17.5+, Firefox 129+) for this app.
- Do NOT add new dependencies.
- Do NOT extend the reveal to the outcome-grid winner card, the "Paid" note, or
  the Feed — those are separate findings, out of scope here.
- If the CSS around line 934 or the `:root` block at line 1 does not match the
  excerpts above (drift since commit 75aa8a3), STOP and report instead of
  improvising.

## Verification

- **Mechanical**: from `app/`, run `npm run build` (or `npx next build`) and
  confirm it compiles with no CSS errors. There is no CSS linter in this repo, so
  the build is the mechanical gate.
- **Feel check**: run the app, open a Settled Pool (or the public
  `/receipt/<address>` page) so `ProofReceipt` mounts fresh, and confirm:
  - The 🏆 trophy stamps *down* from slightly-too-big (scale 1.15→1) with a small
    counter-rotate settling to upright — it should read as a stamp landing, not a
    fade.
  - The receipt body rises a few px as it fades, and the "Verified in your
    browser" ✓ badge is the *last* thing to settle (~220ms in), so the eye lands
    on the verification.
  - In DevTools → Animations panel, set playback to 10% and confirm the three
    beats are sequenced (trophy → body → verify), not simultaneous, and nothing
    scales from `scale(0)` (must start at 1.15 / 0.9, never 0).
  - Toggle `prefers-reduced-motion: reduce` (DevTools → Rendering) and reload the
    receipt: elements should cross-fade in with **no movement, no stagger**, and
    still be fully legible — feedback preserved, motion dropped.
- **Done when**: the settlement reveal is a sequenced stamp-and-verify moment in
  the default case, degrades to a plain fade under reduced motion, the build
  passes, and no `.tsx` file was modified.
