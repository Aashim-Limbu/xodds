---
name: FinalWhistle
description: Bet with friends on the World Cup, settled by proof — a floodlit-night-match dark UI.
colors:
  night-navy: "#0b0f14"
  panel: "#141b24"
  panel-raised: "#1c2530"
  line: "#26313d"
  ink: "#e6edf3"
  muted: "#8b98a5"
  pitch-green: "#35d07f"
  floodlight-blue: "#4aa3ff"
  card-red: "#ff6b6b"
  on-green: "#04120a"
typography:
  display:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "normal"
    fontFeature: "tabular-nums"
  headline:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    letterSpacing: "-0.02em"
  title:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 700
  body:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    letterSpacing: "0.04em"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "12px"
rounded:
  sm: "10px"
  md: "14px"
  pill: "999px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.pitch-green}"
    textColor: "{colors.on-green}"
    rounded: "{rounded.sm}"
    padding: "10px 14px"
  button-secondary:
    backgroundColor: "{colors.panel-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "10px 14px"
  input:
    backgroundColor: "{colors.panel-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "9px 11px"
  panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "18px"
  badge-open:
    backgroundColor: "rgba(53,208,127,0.15)"
    textColor: "{colors.pitch-green}"
    rounded: "{rounded.pill}"
  badge-locked:
    backgroundColor: "rgba(74,163,255,0.15)"
    textColor: "{colors.floodlight-blue}"
    rounded: "{rounded.pill}"
  badge-void:
    backgroundColor: "rgba(255,107,107,0.15)"
    textColor: "{colors.card-red}"
    rounded: "{rounded.pill}"
---

## Overview

**The Floodlit Night Match.** The stadium after dark: a deep navy night, the bright glow of the screen a group of mates crowds around, and pitch-green as the colour of "we won." The system is a flat, tonal **dark UI** — surfaces are distinguished by lightness and hairline borders, never shadow — with a small set of bright signal colours doing all the talking. It should feel social and alive (matchday, group-chat energy), with the trust machinery kept quiet until settlement, when the Proof Receipt lights up as the payoff.

It should **not** feel like a cold trading terminal (dense grids, unfriendly data walls) or generic SaaS (identical icon-and-heading cards, gradient accents). Today the implementation is restrained and utilitarian — honest for an MVP but plainer than the brand wants; future work pushes it toward more matchday warmth and a celebratory settlement moment, without breaking the flat-dark foundation.

## Colors

A dark tonal base carries three signal colours mapped to meaning; colour is never the *only* signal (every Pool state also carries a text label, for AA compliance).

- **Night Navy** `#0b0f14` — the body; the stadium at night. **Panel** `#141b24` and **Panel Raised** `#1c2530` are the two tonal surface steps above it; **Line** `#26313d` is the hairline border that separates them.
- **Ink** `#e6edf3` is primary text (AA on every surface); **Muted** `#8b98a5` is secondary/label text — use it only where AA holds, never for body copy on the darkest surfaces.
- **Pitch Green** `#35d07f` — the primary accent: primary actions, the winning Outcome, Open state, "we won." On green, text is near-black **On-Green** `#04120a`.
- **Floodlight Blue** `#4aa3ff` — the secondary/info accent: links, the Locked state, Feed authors.
- **Card Red** `#ff6b6b` — Void and errors only.

Semantic state ramp (Pool lifecycle): Open = green, Locked = blue, Settled = neutral ink, Void = red — each as a 15%-alpha pill with the matching text colour.

## Typography

**One family** — a system sans stack (`ui-sans-serif, system-ui, …`) — carries everything; product UI doesn't need a display/body pairing. A monospace stack (`ui-monospace, …`) is reserved for one job: the Proof Receipt's hashes, roots, and transaction ids. The scale is fixed (rem/px, not fluid): display 28px/700 for the pot and big numbers, headline 22px/700 (tight `-0.02em`), title 16px/700, body 14px, label 12px/700 tracked `0.04em` uppercase for badges. **Tabular numerals** on all money and numeric data (pot, odds, entries) so figures align. Weight and size carry hierarchy — no colour-clip or decorative type.

## Elevation

**Flat, tonal — no shadows.** Depth is expressed purely by surface lightness (Night Navy → Panel → Panel Raised) plus 1px `line` borders. Panels sit at `md` radius (14px), interactive controls at `sm` (10px), badges at `pill`. The single exception to flatness is the **Proof Receipt**, which earns a pitch-green border and a faint top-down green wash (`linear-gradient` at ~6% alpha) to mark it as the hero surface — a glow, not a card shadow.

## Components

- **Buttons.** Primary = pitch-green fill, near-black text, `sm` radius. Secondary = Panel Raised fill with a `line` border and ink text. Disabled = 0.5 opacity. *(Gap: hover/active/focus states are not yet defined — add them; every interactive control needs default/hover/focus/active/disabled.)*
- **Inputs & selects.** Panel Raised fill, `line` border, `sm` radius, ink text. Same vocabulary across every form control.
- **Panel.** The workhorse surface: Panel fill, `line` border, `md` radius, `18px` padding — used for the Pool header, Outcomes list, Feed, and Proof Receipt.
- **Badge.** Pill, 12px tracked uppercase, one per Pool state (open/locked/settled/void), 15%-alpha background of its signal colour.
- **Outcome row.** A bordered `sm`-radius row (label + odds/Entries + action); the winning Outcome gets a pitch-green border.
- **Pot.** Display-size tabular number — the emotional centre of the Pool header.
- **Feed.** Compact message list (author in Floodlight Blue), italic muted system posts, emoji reaction buttons, presence count.

## Do's and Don'ts

**Do** keep the Pool-state colour mapping consistent everywhere (green→Open, blue→Locked, neutral→Settled, red→Void) and always pair it with a text label. **Do** use tabular numerals for every money value. **Do** treat the Proof Receipt as the one surface allowed to glow — it's the hero. **Do** keep one button/input/badge vocabulary across all screens.

**Don't** rely on colour alone for state (AA). **Don't** add card shadows, glassmorphism, or gradient text — the system is flat and tonal. **Don't** let muted grey carry body copy on the darkest surfaces (contrast). **Don't** grow toward terminal density or identical SaaS card grids. **Don't** ship interactive controls without hover/focus/active states.
