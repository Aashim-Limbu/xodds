# Settle Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the settled Pool as a receipt-first moment — payout hero, Proof Receipt as centerpiece, cryptographic detail behind a disclosure — on Tailwind v4 + shadcn retheme'd to the existing brutalist identity.

**Architecture:** Tailwind v4 runs *alongside* the existing 1,366-line `app/globals.css`, which is moved verbatim into a `legacy` cascade layer so Tailwind utilities can outrank it. shadcn primitives are pulled from `@shadcn` and retheme'd by mapping Tailwind's colour tokens directly onto the existing brutalist CSS variables. Only three surfaces migrate: the settled branch of `PoolView`, `ProofReceipt`, and the public `/receipt/[pool]` page. The other ~17 components keep rendering from the legacy layer untouched.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS v4 (CSS-first, no config file), shadcn/ui (`@shadcn` registry), Radix Collapsible, pnpm.

## Global Constraints

- **Working directory is `app/`** for all `pnpm` commands. The repo root is a separate package (Anchor workspace).
- **Do not delete or rewrite the legacy CSS.** It is moved once, in Task 1, and never edited again in this plan.
- **Preflight must stay off.** Tailwind's Preflight would reset the legacy design system. See Task 1 Step 5.
- **Never redefine `--muted`.** The legacy `--muted: #4d4632` is a *text* colour; shadcn's `--muted` is a *background*. Redefining it turns muted text cream-on-cream across 17 components with no error. Map Tailwind tokens with `@theme inline` instead (Task 1 Step 6).
- **Motion is preserved, not re-invented.** Exact values come from `app/globals.css:953-1004`. Easing is always `var(--ease-out)` = `cubic-bezier(0.23, 1, 0.32, 1)`. Never approximate.
- **Reduced motion:** every animation needs a `@media (prefers-reduced-motion: reduce)` path that is gentler, not absent (opacity-only, no transform, no stagger). This matches the existing pattern and PRODUCT.md's accessibility requirement.
- **Accessibility:** Pool state is never signalled by colour alone — always a text label alongside. WCAG AA on body text and controls.
- **No money logic changes.** `verifyScoreProof`, `fetchSettlement`, `useFixtures`, and the claim path are presentation-only consumers here. Do not alter their behaviour.
- **Verification is browser-based.** The app has no component test infrastructure and this plan does not add any. `tests/*.test.ts` at the repo root are bankrun/SVM program tests and never exercise React.

## Verification Loop (used by every task)

`keeper/e2e-devnet.ts` creates, locks, and **settles** a real Pool against the deployed devnet programs, then prints its address.

```bash
# from the repo root — requires a funded devnet keypair that is also the USDC mint authority
pnpm tsx keeper/e2e-devnet.ts
# last line: E2E OK ✅  pool: <POOL_ADDRESS>
```

Export that address once and reuse it:

```bash
export POOL=<POOL_ADDRESS>
```

`http://localhost:3000/receipt/$POOL` is public — no sign-in, no Privy, no Supabase — and renders `ProofReceipt` standalone via `readOnlyClient`. That is the primary verification surface for Tasks 1–3.

If `pnpm tsx keeper/e2e-devnet.ts` cannot run (no funded keypair), **stop and ask the user for a settled Pool address** rather than skipping verification.

---

### Task 1: Tailwind v4 coexistence infrastructure

Tailwind must run without touching how any existing component looks. Two mechanisms make that true: Preflight stays off, and the legacy CSS moves into a cascade layer that ranks *below* utilities.

**Files:**
- Create: `app/legacy.css` (via `git mv` — content unchanged)
- Create: `app/postcss.config.mjs`
- Create: `app/lib/utils.ts`
- Create: `app/components.json` (generated)
- Rewrite: `app/app/globals.css` (becomes a thin ~40-line entrypoint)
- Modify: `app/package.json` (dependencies)

**Interfaces:**
- Consumes: nothing.
- Produces: `cn(...inputs: ClassValue[]): string` from `@/lib/utils` — the class merger every later task imports. Tailwind utilities that reliably outrank legacy element selectors. Tailwind colour tokens: `bg-background`, `text-foreground`, `bg-card`, `bg-primary`, `text-muted-foreground`, `border-border`, `bg-destructive`, `rounded-md`, `shadow-brut`.

- [ ] **Step 1: Install dependencies**

```bash
cd app
pnpm add clsx tailwind-merge lucide-react
pnpm add -D tailwindcss @tailwindcss/postcss
```

- [ ] **Step 2: Move the legacy CSS out of the way, unchanged**

The file is moved, not edited. `git mv` keeps the rename visible in review instead of showing 1,366 deletions.

```bash
cd app
git mv app/globals.css legacy.css
```

- [ ] **Step 3: Create the PostCSS config**

Create `app/postcss.config.mjs`:

```js
/** @type {import('postcss-load-config').Config} */
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
```

- [ ] **Step 4: Create the class merger**

Create `app/lib/utils.ts`:

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 5: Write the new globals.css entrypoint**

This is the load-bearing file of the whole task. Three things happen here:

1. **`@layer theme, base, legacy, components, utilities;`** declares layer order. `legacy` sits before `utilities`, so utilities win. If the legacy CSS stayed unlayered it would beat every utility, because unlayered CSS outranks all layers.
2. **Preflight is omitted.** Importing `tailwindcss` directly would inject `tailwindcss/preflight.css` and reset the legacy design system. Importing the pieces individually is Tailwind's documented opt-out.
3. **`@theme inline` maps Tailwind's colour tokens straight onto the brutalist variables** — no shadcn `:root` block, which is what avoids the `--muted` collision.

Create `app/app/globals.css`:

```css
/* Layer order: `legacy` must rank BELOW `utilities` so Tailwind utilities can override
   the existing design system. Unlayered CSS outranks every layer, so legacy.css must be
   imported into a layer — never left bare. */
@layer theme, base, legacy, components, utilities;

/* Tailwind, imported piecewise to skip preflight.css. Preflight would reset the legacy
   system (button, input, heading styles) and break the 17 unmigrated components. */
@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/utilities.css" layer(utilities);

/* The existing design system, verbatim, safely outranked by utilities. */
@import "../legacy.css" layer(legacy);

/* Brutalist tokens -> Tailwind tokens. `inline` resolves these at use, so Tailwind's
   colour utilities read the legacy variables directly.

   NOTE: legacy `--muted` is the muted TEXT colour (#4d4632). shadcn/Tailwind's `--muted`
   is a BACKGROUND. They are deliberately NOT aliased — `--color-muted` gets the cream,
   `--color-muted-foreground` gets the legacy text colour. Never redefine `--muted` in
   :root; it silently breaks every component that uses it. */
@theme inline {
  --color-background: var(--bg);
  --color-foreground: var(--ink);
  --color-card: var(--paper);
  --color-card-foreground: var(--ink);
  --color-popover: var(--paper);
  --color-popover-foreground: var(--ink);
  --color-primary: var(--yellow);
  --color-primary-foreground: var(--ink);
  --color-secondary: var(--cream-2);
  --color-secondary-foreground: var(--ink);
  --color-muted: var(--cream-2);
  --color-muted-foreground: var(--muted);
  --color-accent: var(--cream-2);
  --color-accent-foreground: var(--ink);
  --color-destructive: var(--danger);
  --color-destructive-foreground: #ffffff;
  --color-success: var(--green);
  --color-border: var(--ink);
  --color-input: var(--ink);
  --color-ring: var(--blue);

  --radius-sm: var(--r-sm);
  --radius-md: var(--r-md);
  --radius-lg: var(--r-md);

  --font-display: var(--display);
  --font-sans: var(--body);
  --font-mono: var(--mono);

  --shadow-brut-sm: var(--shadow-sm);
  --shadow-brut: var(--shadow);
  --shadow-brut-lg: var(--shadow-lg);

  --ease-brut: var(--ease-out);
}
```

- [ ] **Step 6: Point the layout at the moved stylesheet if needed**

`app/app/layout.tsx` imports `./globals.css`. That path is unchanged, so no edit is expected. Confirm:

```bash
cd app && grep -n "globals.css" app/layout.tsx
```

Expected: `import "./globals.css";` — leave it alone. If the import points anywhere else, fix it to `./globals.css`.

- [ ] **Step 7: Generate components.json without letting shadcn clobber globals.css**

The shadcn CLI rewrites `globals.css` on init. Guard the file we just wrote:

```bash
cd app
cp app/globals.css /tmp/globals.css.bak
pnpm dlx shadcn@latest init -d
cp /tmp/globals.css.bak app/globals.css
```

Then open `app/components.json` and confirm these values, editing if the CLI guessed differently:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "registries": {}
}
```

`"config": ""` is correct for Tailwind v4 — there is no `tailwind.config.js`.

- [ ] **Step 8: Verify the legacy app is visually unchanged**

```bash
cd app && pnpm dev
```

Open `http://localhost:3000`. The app must look **exactly** as it did before this task — same yellow, same hard shadows, same fonts, same buttons. Any visual change means Preflight leaked in (re-check Step 5's imports) or the legacy import failed (check the browser devtools Network/Console for a CSS 404 on `legacy.css`).

- [ ] **Step 9: Verify utilities actually outrank legacy CSS**

This is the check that proves the layer order works. Temporarily add a Tailwind utility to a bare `<button>` — the element legacy CSS styles most aggressively.

In `app/app/page.tsx`, temporarily add to any existing `<button>`: `className="bg-primary"`.

Expected: the button turns **yellow** (`--yellow` #ffd700), overriding `button { background: var(--ink) }` from `legacy.css:100`.

If it stays black/ink, the layer order is wrong — `legacy.css` is unlayered or declared after `utilities`. Fix Step 5 before continuing.

**Revert the temporary `className` once confirmed.**

- [ ] **Step 10: Typecheck**

```bash
cd app && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 11: Commit**

```bash
cd app
git add package.json pnpm-lock.yaml postcss.config.mjs components.json lib/utils.ts legacy.css app/globals.css
git commit -m "Tailwind v4 alongside the legacy CSS, in a lower cascade layer

Preflight is off and legacy.css is imported into a `legacy` layer that ranks
below `utilities`, so Tailwind can override the existing design system instead
of silently losing to it (unlayered CSS outranks every layer).

Tailwind colour tokens map onto the brutalist variables via @theme inline,
which avoids redefining --muted (legacy: muted text; shadcn: a background)."
```

---

### Task 2: Retheme'd shadcn primitives

shadcn's defaults are rounded and soft — "generic SaaS", the product's own anti-reference. Each primitive is overridden to the brutalist look: 3px ink border, hard offset shadow, uppercase weight-800 labels.

**Files:**
- Create: `app/components/ui/button.tsx`, `card.tsx`, `badge.tsx`, `collapsible.tsx`, `separator.tsx`, `alert.tsx`, `skeleton.tsx` (generated, then edited)

**Interfaces:**
- Consumes: `cn` from `@/lib/utils`; the Tailwind tokens from Task 1.
- Produces:
  - `<Button variant="default" | "secondary" | "ghost" | "link" size="default" | "sm" | "lg">`
  - `<Card>`, `<CardHeader>`, `<CardTitle>`, `<CardContent>`, `<CardFooter>`
  - `<Badge variant="default" | "secondary" | "destructive" | "outline">`
  - `<Collapsible open?: boolean defaultOpen?: boolean>`, `<CollapsibleTrigger>`, `<CollapsibleContent>`
  - `<Separator orientation="horizontal" | "vertical">`
  - `<Alert variant="default" | "destructive">`, `<AlertTitle>`, `<AlertDescription>`
  - `<Skeleton className?: string>`

- [ ] **Step 1: Add the primitives**

```bash
cd app
pnpm dlx shadcn@latest add button card badge collapsible separator alert skeleton
```

This also installs `@radix-ui/react-collapsible`, `@radix-ui/react-separator`, and `@radix-ui/react-slot`.

- [ ] **Step 2: Retheme Button**

In `app/components/ui/button.tsx`, replace the `buttonVariants` definition with:

```ts
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm border-[3px] border-border font-sans text-[13px] font-extrabold uppercase tracking-[0.04em] shadow-brut-sm transition-[transform,box-shadow,background] duration-[120ms] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[1px_1px_0_0_var(--ink)] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 disabled:translate-x-0 disabled:translate-y-0 disabled:shadow-brut-sm motion-reduce:transition-none motion-reduce:hover:translate-x-0 motion-reduce:hover:translate-y-0 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-foreground text-white",
        primary: "bg-primary text-primary-foreground",
        secondary: "bg-card text-foreground hover:bg-secondary",
        ghost: "border-transparent bg-transparent shadow-none hover:bg-secondary hover:translate-x-0 hover:translate-y-0 hover:shadow-none",
        link: "border-transparent bg-transparent shadow-none underline-offset-4 hover:underline hover:translate-x-0 hover:translate-y-0 hover:shadow-none",
      },
      size: {
        default: "px-4 py-[10px]",
        sm: "px-3 py-2 text-[12px]",
        lg: "px-6 py-3 text-[15px]",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);
```

`default` reproduces the legacy ink button exactly (`legacy.css:100-116`). `primary` is the new yellow CTA used for Claim in Task 4. The `motion-reduce:` variants honour the reduced-motion constraint.

- [ ] **Step 3: Retheme Card**

In `app/components/ui/card.tsx`, replace the root `Card` className with:

```tsx
className={cn(
  "flex flex-col gap-4 rounded-md border-[3px] border-border bg-card p-5 text-card-foreground shadow-brut",
  className,
)}
```

- [ ] **Step 4: Retheme Badge**

In `app/components/ui/badge.tsx`, replace `badgeVariants` with:

```ts
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 rounded-sm border-2 border-border px-2 py-[3px] font-mono text-[11px] font-bold uppercase tracking-[0.04em]",
  {
    variants: {
      variant: {
        default: "bg-primary text-foreground",
        secondary: "bg-secondary text-foreground",
        destructive: "bg-destructive text-white",
        outline: "bg-card text-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);
```

- [ ] **Step 5: Retheme Alert**

In `app/components/ui/alert.tsx`, replace `alertVariants` with:

```ts
const alertVariants = cva(
  "relative grid w-full grid-cols-[auto_1fr] items-start gap-x-3 rounded-sm border-[3px] border-border p-4",
  {
    variants: {
      variant: {
        default: "bg-card text-foreground",
        success: "bg-card text-foreground",
        destructive: "bg-card text-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);
```

Colour alone never signals state here — Task 3 pairs every variant with a text label and a mark, per the accessibility constraint.

- [ ] **Step 6: Retheme Skeleton**

Replace the body of `app/components/ui/skeleton.tsx` with:

```tsx
import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "rounded-sm border-2 border-border bg-secondary motion-safe:animate-pulse",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
```

`motion-safe:` keeps the pulse off under reduced motion, matching `legacy.css:1363-1365`.

- [ ] **Step 7: Leave Collapsible and Separator as generated**

Neither needs a retheme. `collapsible.tsx` gets its animation and classes from Task 3. `separator.tsx` already uses `bg-border`, which Task 1 mapped to `var(--ink)` — it renders ink automatically.

Confirm and move on:

```bash
cd app && grep -n "bg-border" components/ui/separator.tsx
```

Expected: a match. If `bg-border` is absent, add it to the separator's className. Otherwise change nothing.

- [ ] **Step 8: Typecheck**

```bash
cd app && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
cd app
git add components/ui package.json pnpm-lock.yaml
git commit -m "Add shadcn primitives, retheme'd to the brutalist system

Button/Card/Badge/Alert/Skeleton overridden to 3px ink borders, hard offset
shadows, and uppercase mono/display type so they match the existing design
system rather than shipping shadcn's rounded neutral defaults."
```

---

### Task 3: ProofReceipt — receipt-first rewrite

The receipt is the hero. A fan reads down to "Verified in your browser" and stops; the hex lives behind a disclosure. **The existing settlement reveal must survive this rewrite** — it hangs on the class hooks `.proven-panel .sticker`, `.receipt-body`, and `.verify`, and nothing in the type system will tell you if you drop them.

**Files:**
- Rewrite: `app/components/ProofReceipt.tsx`
- Modify: `app/app/globals.css` (append the collapsible animation only)

**Interfaces:**
- Consumes: `Button`, `Card`, `Badge`, `Skeleton`, `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent`. Unchanged existing APIs: `readOnlyClient()`, `client.fetchSettlement(pk: PublicKey): Promise<SettlementReceipt>`, `verifyScoreProof(fixtureId, proven, merklePath, scoreRoot): { ok: boolean; computedRoot: Uint8Array }`, `toHex(bytes: Uint8Array): string`, `fixtureById(id: bigint)`, `poolOutcomeLabels(poolType, lineX2, fixture): string[]`, `scoresRootPda(fixtureId): PublicKey`, `useFixtures()`, `useFinalWhistle()`.
- Produces: `<ProofReceipt address: string fixtureId: bigint poolType: PoolTypeName lineX2: number />` — the prop signature is **unchanged**, so `PoolView` and `/receipt/[pool]` keep working.

- [ ] **Step 1: Add the collapsible animation to globals.css**

Append to `app/app/globals.css`:

```css
/* "Check it yourself" disclosure. Radix ships unstyled, so without this the proof
   detail snaps open. Values follow the existing vocabulary (--ease-out, sub-300ms). */
@media (prefers-reduced-motion: no-preference) {
  .proof-detail[data-state="open"] {
    animation: proof-detail-open 200ms var(--ease-out);
  }
  .proof-detail[data-state="closed"] {
    animation: proof-detail-close 200ms var(--ease-out);
  }
  @keyframes proof-detail-open {
    from { height: 0; opacity: 0; }
    to { height: var(--radix-collapsible-content-height); opacity: 1; }
  }
  @keyframes proof-detail-close {
    from { height: var(--radix-collapsible-content-height); opacity: 1; }
    to { height: 0; opacity: 0; }
  }
}

/* Reduced motion: fade only, no height animation. */
@media (prefers-reduced-motion: reduce) {
  .proof-detail[data-state="open"] { animation: proof-detail-fade 150ms ease; }
  @keyframes proof-detail-fade { from { opacity: 0; } to { opacity: 1; } }
}
```

- [ ] **Step 2: Rewrite ProofReceipt**

Replace `app/components/ProofReceipt.tsx` entirely:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { type PoolTypeName, readOnlyClient, type SettlementReceipt, toHex } from "@/lib/anchorClient";
import { verifyScoreProof } from "@/lib/proof";
import { scoresRootPda } from "@/lib/pdas";
import { useFinalWhistle } from "@/lib/useFinalWhistle";
import { fixtureById, poolOutcomeLabels } from "@/lib/fixtures";
import { useFixtures } from "@/lib/useTxlineLive";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

function short(hex: string): string {
  return hex.length <= 20 ? hex : `${hex.slice(0, 10)}…${hex.slice(-10)}`;
}

/**
 * The Proof Receipt — the hero artifact. A fan reads down to "Verified in your browser"
 * and stops; the score root, Merkle path, and settlement tx live behind "Check it
 * yourself" so the chain never lands on someone who didn't ask for it (PRODUCT.md:
 * crypto is invisible). A FAILED proof is never hidden — it renders open.
 *
 * The class hooks `proven-panel`, `sticker`, `receipt-body`, and `verify` carry the
 * settlement reveal in globals.css (the legacy layer). Renaming them silently kills the
 * app's signature moment — no error, no test failure. Leave them alone.
 */
export function ProofReceipt({
  address,
  fixtureId,
  poolType,
  lineX2,
}: {
  address: string;
  fixtureId: bigint;
  poolType: PoolTypeName;
  lineX2: number;
}) {
  const { client: authed } = useFinalWhistle();
  // Settlement is public: fall back to a wallet-less client so the receipt renders on the
  // public share page (and to any signed-out viewer) exactly as it does in-app.
  const client = useMemo(() => authed ?? readOnlyClient(), [authed]);
  useFixtures(); // hydrate real TxLINE fixtures on direct /receipt/<id> loads
  const [receipt, setReceipt] = useState<SettlementReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [shared, setShared] = useState(false);

  useEffect(() => {
    if (!client) return;
    let live = true;
    client
      .fetchSettlement(new PublicKey(address))
      .then((r) => live && setReceipt(r))
      .catch(() => live && setReceipt(null))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [client, address]);

  // Re-derive the score root from the receipt's own values, right here in the browser. If it
  // reproduces the root TxLINE published, these exact stats are what settle() proved against.
  const check = useMemo(
    () => (receipt ? verifyScoreProof(fixtureId, receipt.proven, receipt.merklePath, receipt.scoreRoot) : null),
    [receipt, fixtureId],
  );

  // The skeleton renders in a SIBLING branch, not the same subtree position as the
  // resolved receipt. @starting-style only fires on freshly inserted nodes — reusing the
  // position would stop the reveal from triggering.
  if (loading) {
    return (
      <Card className="gap-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-16 w-full" />
        <span className="sr-only">Building Proof Receipt…</span>
      </Card>
    );
  }
  if (!receipt) {
    return <Card className="text-muted-foreground">No settlement proof found for this Pool.</Card>;
  }

  const fixture = fixtureById(fixtureId);
  const labels = poolOutcomeLabels(poolType, lineX2, fixture);
  const p = receipt.proven;
  const explorer = `https://explorer.solana.com/tx/${receipt.signature}?cluster=devnet`;

  async function share() {
    const url = `${window.location.origin}/receipt/${address}`;
    const text = `Proven on-chain: ${labels[receipt!.winningOutcome]} — nobody, including us, chose it.`;
    // Native share sheet on mobile; clipboard everywhere else.
    if (navigator.share) {
      try {
        await navigator.share({ title: "xOdds Proof Receipt", text, url });
        return;
      } catch {
        /* user cancelled — fall through to copy */
      }
    }
    await navigator.clipboard.writeText(url);
    setShared(true);
    setTimeout(() => setShared(false), 1600);
  }

  return (
    <Card className="receipt-split gap-0 overflow-hidden p-0">
      <div className="proven-panel flex items-center gap-3 border-b-[3px] border-border bg-primary px-5 py-3">
        <span className="sticker text-2xl" aria-hidden="true">🏆</span>
        <span className="proven-word font-display text-lg font-extrabold uppercase tracking-[0.06em]">
          Proven
        </span>
      </div>

      <div className="receipt-body flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="m-0 font-display text-xl font-extrabold uppercase">Proof Receipt</h2>
            {fixture && (
              <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                <span>{fixture.home}</span>
                <Badge variant="outline" className="text-[13px]">
                  {p.homeGoals}&ndash;{p.awayGoals}
                </Badge>
                <span>{fixture.away}</span>
              </div>
            )}
          </div>
          <Button variant="secondary" size="sm" onClick={share}>
            {shared ? "Link copied ✓" : "Share receipt"}
          </Button>
        </div>

        <div className="font-display text-2xl font-extrabold uppercase">
          {labels[receipt.winningOutcome]} wins
        </div>

        <p className="m-0 text-[13px] text-muted-foreground">
          Nobody, including us, chose this outcome. It was proven on-chain from TxLINE&rsquo;s Score
          Proof — and re-checked right here in your browser.
        </p>

        {check && (
          <div
            className={cnVerify(check.ok)}
            role="status"
          >
            <span className="verify-mark text-xl leading-none" aria-hidden="true">
              {check.ok ? "✓" : "✕"}
            </span>
            <div>
              <div className="verify-title text-sm font-extrabold uppercase">
                {check.ok ? "Verified in your browser" : "Verification failed"}
              </div>
              <div className="verify-sub mt-0.5 text-xs text-muted-foreground">
                {check.ok
                  ? "The values below were hashed on your device and reproduce TxLINE’s published root exactly — no trust in us required."
                  : "These values do not reproduce the published root. Do not trust this receipt."}
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Proven score" value={`${p.homeGoals}–${p.awayGoals}`} strong />
          <Stat label="Winning Outcome" value={labels[receipt.winningOutcome]} strong />
          <Stat label="Corners (H/A)" value={`${p.homeCorners} / ${p.awayCorners}`} />
          <Stat label="Cards (H/A)" value={`${p.homeCards} / ${p.awayCards}`} />
        </div>

        {/* A failed proof is evidence, not a detail: render it open and never let a fan
            miss it behind a disclosure. */}
        <Collapsible defaultOpen={check ? !check.ok : false}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between px-0">
              <span>⛓ Check it yourself</span>
              <span aria-hidden="true" className="text-muted-foreground">Show proof detail</span>
            </Button>
          </CollapsibleTrigger>

          <CollapsibleContent className="proof-detail overflow-hidden">
            <div className="flex flex-col gap-3 pt-3">
              <div>
                <Label>TxLINE score root (verified against)</Label>
                <code className="mono receipt-bar">{toHex(receipt.scoreRoot)}</code>
                <a
                  className="mono receipt-bar mt-1.5 block"
                  href={`https://explorer.solana.com/address/${scoresRootPda(fixtureId).toBase58()}?cluster=devnet`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Published in a TxLINE-owned account ↗
                </a>
                {check && !check.ok && (
                  <>
                    <Label className="mt-1.5">Root recomputed here (does not match)</Label>
                    <code className="mono receipt-bar text-destructive">{toHex(check.computedRoot)}</code>
                  </>
                )}
              </div>
              <div>
                <Label>
                  Merkle path ({receipt.merklePath.length} node{receipt.merklePath.length === 1 ? "" : "s"})
                </Label>
                {receipt.merklePath.length === 0 ? (
                  <span className="text-[13px] text-muted-foreground">— (the Fixture leaf is the root)</span>
                ) : (
                  receipt.merklePath.map((node, i) => (
                    <code className="mono receipt-bar" key={i}>{short(toHex(node))}</code>
                  ))
                )}
              </div>
              <div>
                <Label>Settlement transaction</Label>
                <a className="mono receipt-bar" href={explorer} target="_blank" rel="noreferrer">
                  {short(receipt.signature)} ↗
                </a>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </Card>
  );
}

/* `verify` is a legacy class hook carrying the reveal's third beat — keep it. */
function cnVerify(ok: boolean): string {
  return `verify ${ok ? "verify-ok" : "verify-fail"} flex items-start gap-3 rounded-sm border-[3px] border-border p-3`;
}

function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`receipt-label ${className ?? ""}`}>{children}</div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <div className="receipt-label">{label}</div>
      <div className={strong ? "receipt-strong" : ""}>{value}</div>
    </div>
  );
}
```

- [ ] **Step 3: Get a settled Pool address**

```bash
cd /home/aashim/hackathon/think
pnpm tsx keeper/e2e-devnet.ts
# note the address from: E2E OK ✅  pool: <POOL_ADDRESS>
export POOL=<POOL_ADDRESS>
```

- [ ] **Step 4: Verify the receipt renders and the disclosure is collapsed**

```bash
cd app && pnpm dev
```

Open `http://localhost:3000/receipt/$POOL`. Confirm all of:

1. The 🏆 Proven panel, final score, `{Outcome} wins`, and the green **Verified in your browser** badge are visible.
2. **No hex is visible on load.** The score root, Merkle path, and signature are hidden.
3. Clicking **Check it yourself** expands them smoothly (~200ms), not with a snap.
4. Clicking again collapses them.

- [ ] **Step 5: Verify the settlement reveal survived — the regression this task exists to prevent**

Hard-reload `http://localhost:3000/receipt/$POOL` (Cmd/Ctrl+Shift+R) and watch the moment the receipt resolves.

Expected: the 🏆 sticker scales in over ~420ms, the body follows ~60ms later, and the **Verified** badge lands last at ~220ms. Three distinct beats.

If everything appears at once, the reveal is dead. Check that:
- the class hooks `proven-panel`, `sticker`, `receipt-body`, `verify` are all still present in the rendered DOM (inspect the element), and
- the skeleton in Step 2 is in a separate return branch, not the same subtree position.

- [ ] **Step 6: Verify reduced motion**

In Chrome DevTools: Cmd/Ctrl+Shift+P → "Emulate CSS prefers-reduced-motion: reduce". Hard-reload the page.

Expected: the receipt fades in (~200ms), with no movement, no scaling, no stagger. The disclosure fades open with no height animation. Nothing is instant or absent.

- [ ] **Step 7: Verify the failure path renders open**

Temporarily force a failure — in `ProofReceipt.tsx`, change the `check` memo to:

```tsx
const check = useMemo(() => ({ ok: false, computedRoot: new Uint8Array(32) }), []);
```

Reload. Expected: the **Verification failed** state shows, and the proof detail is **already expanded** with the mismatched root visible in red — no click needed.

**Revert this change once confirmed.**

- [ ] **Step 8: Typecheck**

```bash
cd app && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
cd app
git add components/ProofReceipt.tsx app/globals.css
git commit -m "ProofReceipt: receipt-first, proof detail behind a disclosure

The verified-in-your-browser result is the payload a fan reads; root, Merkle
path, and tx move behind 'Check it yourself'. A failed proof renders open —
evidence is never hidden behind a click.

Keeps the proven-panel/sticker/receipt-body/verify class hooks so the
settlement reveal (globals.css) survives the rewrite."
```

---

### Task 4: SettledPool — payout hero replaces the market grid

A settled Pool currently renders the open market's outcome grid with a Winner chip bolted on, and buries `Claim` below "Run it back". This extracts the settled branch into its own component: result, payout, receipt, rematch.

**Files:**
- Create: `app/components/SettledPool.tsx`
- Modify: `app/components/PoolView.tsx` (the settled branch and its render path)

**Interfaces:**
- Consumes: `Button`, `Card`, `Badge`, `ProofReceipt`; `formatUsdc(v: bigint): string` and the pool/claim values passed as props.
- Produces: `<SettledPool />` with this exact signature —

```tsx
{
  pool: Pool;            // the settled Pool (state === "settled")
  address: string;
  labels: string[];      // from poolOutcomeLabels
  fixture: Fixture | undefined;
  myEntries: Record<number, bigint | undefined>;
  myPayout: bigint;
  claimStatus: "idle" | "claiming" | "paid";
  paidAmount: bigint | null;
  busy: boolean;
  canAct: boolean;       // `!!client`
  onClaim: () => void;
  onRematch: () => void;
  error: string | null;
}
```

- [ ] **Step 1: Read the current settled branch before touching it**

```bash
cd app && sed -n 90,170p components/PoolView.tsx
```

You need the exact semantics of `myEntries`, `myWinEntry`, `myPayout`, `claimStatus`, `paidAmount`, `doClaim`, and `rematch`. This task moves their *presentation* only — do not change how any of them are computed.

- [ ] **Step 2: Create SettledPool**

Create `app/components/SettledPool.tsx`:

```tsx
"use client";

import type { PoolTypeName } from "@/lib/anchorClient";
import type { Fixture } from "@/lib/fixtures";
import { formatUsdc } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProofReceipt } from "@/components/ProofReceipt";

/**
 * A settled Pool. The market is over, so the market grid is gone: this reads
 * result -> payout -> proof -> rematch. The Proof Receipt is the hero (PRODUCT.md),
 * so nothing competes with it above the fold except the money.
 */
export function SettledPool({
  pool,
  address,
  labels,
  fixture,
  myEntries,
  myPayout,
  claimStatus,
  paidAmount,
  busy,
  canAct,
  onClaim,
  onRematch,
  error,
}: {
  pool: {
    fixtureId: bigint;
    poolType: PoolTypeName;
    lineX2: number;
    winningOutcome: number | null;
    pot: bigint;
  };
  address: string;
  labels: string[];
  fixture: Fixture | undefined;
  myEntries: Record<number, bigint | undefined>;
  myPayout: bigint;
  claimStatus: "idle" | "claiming" | "paid";
  paidAmount: bigint | null;
  busy: boolean;
  canAct: boolean;
  onClaim: () => void;
  onRematch: () => void;
  error: string | null;
}) {
  const winning = pool.winningOutcome;
  const myWinEntry = winning !== null ? myEntries[winning] : undefined;
  // What did I actually back? A losing Member still gets a straight answer, not a
  // dead button — the receipt has to be legible to winners and losers alike.
  const backed = Object.entries(myEntries)
    .filter(([, v]) => v && v > 0n)
    .map(([o, v]) => ({ outcome: Number(o), amount: v as bigint }));
  const played = backed.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <Card className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* State carries a text label, never colour alone. */}
          <Badge variant="secondary">Settled</Badge>
          <span className="text-[13px] text-muted-foreground">
            ${formatUsdc(pool.pot)} pot
          </span>
        </div>

        {fixture && winning !== null && (
          <div className="font-display text-2xl font-extrabold uppercase">
            {labels[winning]} wins
          </div>
        )}

        {played && (
          <div className="text-sm font-semibold">
            You backed{" "}
            {backed.map((b, i) => (
              <span key={b.outcome}>
                {i > 0 ? ", " : ""}
                {labels[b.outcome]} · ${formatUsdc(b.amount)}
              </span>
            ))}
          </div>
        )}

        {claimStatus === "paid" && (
          <p className="entry-note m-0">✅ Paid ${formatUsdc(paidAmount ?? 0n)} to your wallet.</p>
        )}
        {myWinEntry && claimStatus === "claiming" && (
          <p className="entry-note m-0">🎉 Claiming your ${formatUsdc(myPayout)} payout…</p>
        )}
        {myWinEntry && claimStatus === "idle" && (
          <Button variant="primary" size="lg" disabled={busy || !canAct} onClick={onClaim}>
            Claim ${formatUsdc(myPayout)}
          </Button>
        )}
        {played && !myWinEntry && claimStatus !== "paid" && (
          <p className="m-0 text-sm text-muted-foreground">
            No payout this time — your Outcome didn&rsquo;t come in. The proof is below.
          </p>
        )}

        {error && <p className="error">{error}</p>}
      </Card>

      <ProofReceipt
        address={address}
        fixtureId={pool.fixtureId}
        poolType={pool.poolType}
        lineX2={pool.lineX2}
      />

      <Button variant="secondary" disabled={busy || !canAct} onClick={onRematch}>
        🔁 Run it back — same Pool, new game
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Confirm the formatUsdc import path**

```bash
cd app && grep -rn "export function formatUsdc\|export const formatUsdc" lib/
```

Fix the import in `SettledPool.tsx` to match the real module. If `formatUsdc` lives elsewhere (e.g. `@/lib/usdc`), update the import — do not move the function.

- [ ] **Step 4: Branch PoolView to SettledPool**

In `app/components/PoolView.tsx`:

1. Add the import: `import { SettledPool } from "@/components/SettledPool";`
2. Replace the entire settled render path. The outcome grid (`components/PoolView.tsx:248-297`), the `claimStatus`/`Claim`/`rematch` block (`:323-339`), and the trailing `<ProofReceipt>` (`:342-344`) are all superseded when `pool.state === "settled"`.

Insert this early return immediately before the existing `return (` of the main render, keeping every hook call above it (hooks must not be skipped):

```tsx
if (pool.state === "settled") {
  return (
    <div className="pool-view">
      <SettledPool
        pool={pool}
        address={address}
        labels={labels}
        fixture={fixture}
        myEntries={myEntries}
        myPayout={myPayout}
        claimStatus={claimStatus}
        paidAmount={paidAmount}
        busy={busy}
        canAct={!!client}
        onClaim={doClaim}
        onRematch={rematch}
        error={error}
      />
      <Feed feed={feed} />
    </div>
  );
}
```

3. Remove the now-dead settled-only branches from the main return: the `isWinner` logic in the outcome grid, the `Claim`/`claiming`/`paid` block, the `settled` arm of the rematch condition, and the trailing `<ProofReceipt>`. Leave the `void` arms alone — Void still uses the grid for refunds.

**Do not** remove `.outcome.win` / `.badge.settled` styles from `legacy.css`; the file is not edited in this plan and the dead CSS costs nothing. It can go in the follow-up migration.

- [ ] **Step 5: Verify hooks still run unconditionally**

```bash
cd app && pnpm typecheck
```

Expected: no errors. Then confirm by eye that the `if (pool.state === "settled")` early return sits **below** every `useState`/`useEffect`/`useMemo`/`useRef` in the component. React throws "Rendered fewer hooks than expected" at runtime if any hook ended up below it — the typechecker will not catch this.

- [ ] **Step 6: Verify in the app**

```bash
cd app && pnpm dev
```

Sign in and open the settled Pool from `$POOL` (or any settled Pool in your Group). Confirm:

1. **No market grid.** No odds, no stake chips, no Back buttons.
2. Reading order is: Settled badge + `{Outcome} wins` → your position → payout → Proof Receipt → Run it back.
3. As a winner: `Claim $X` is the one prominent yellow CTA. Clicking it pays out and the state persists to `✅ Paid $X`.
4. As a loser (or with a second account): an honest "No payout this time" line, no dead button.
5. The Feed still renders below.

- [ ] **Step 7: Verify the payout entrance survived**

Watch the moment `Claim` transitions to `✅ Paid $X`. The note should rise ~6px and fade in over ~280ms — the `.entry-note` animation from `legacy.css:997-1004`. If it appears instantly, the `entry-note` class was dropped from the `<p>` in Step 2.

- [ ] **Step 8: Run the program test suite**

The settled surfaces read on-chain state; confirm nothing upstream drifted.

```bash
cd /home/aashim/hackathon/think && pnpm test
```

Expected: all suites pass (~11s, serial).

- [ ] **Step 9: Commit**

```bash
cd app
git add components/SettledPool.tsx components/PoolView.tsx
git commit -m "SettledPool: payout hero replaces the market grid

A settled Pool no longer renders the open market's odds grid with a Winner chip
bolted on. Reading order is result -> payout -> Proof Receipt -> rematch, with
Claim as the single primary CTA instead of a button buried under 'Run it back'.

Losing Members get a straight answer rather than a dead button; the receipt
stays legible to winners and losers alike."
```

---

## Follow-ups (out of scope for this plan)

- Migrate the remaining ~17 components off the `legacy` layer, then delete `legacy.css`.
- Remove the dead `.outcome.win` / `.badge.settled` / `.receipt-split` rules once nothing references them.
- Dark mode — no dark tokens exist today.
