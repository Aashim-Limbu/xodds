---
name: xOdds
description: Bet with friends on the World Cup, settled by proof — a neo-brutalist yellow sticker-book UI.
colors:
  cream: "#fff8ef"
  paper: "#ffffff"
  cream-2: "#f6edda"
  ink: "#1f1b10"
  muted: "#4d4632"
  yellow: "#ffd600"
  yellow-deep: "#e9c400"
  blue: "#0046fa"
  green: "#00873c"
  card-red: "#d32f2f"
  tint-open: "#c8f7d8"
  tint-locked: "#d1d7ff"
  tint-settled: "#e2e2e2"
  tint-void: "#ffdad6"
typography:
  display:
    fontFamily: "Anybody, sans-serif"
    fontWeight: 900
    fontStyle: italic
    letterSpacing: "-0.02em"
    transform: uppercase
  body:
    fontFamily: "Hanken Grotesk, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.5
  label:
    fontFamily: "Hanken Grotesk, sans-serif"
    fontSize: "13px"
    fontWeight: 800
    letterSpacing: "0.04em"
    transform: uppercase
  mono:
    fontFamily: "JetBrains Mono, monospace"
    fontSize: "12px"
    fontWeight: 600
rounded:
  sm: "8px"
  md: "14px"
  pill: "999px"
shadows:
  sm: "3px 3px 0 0 ink"
  md: "4px 4px 0 0 ink"
  lg: "8px 8px 0 0 ink"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "#ffffff"
    border: "3px solid {colors.ink}"
    rounded: "{rounded.sm}"
    shadow: "{shadows.sm}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    border: "3px solid {colors.ink}"
    rounded: "{rounded.sm}"
    shadow: "{shadows.sm}"
  panel:
    backgroundColor: "{colors.paper}"
    border: "3px solid {colors.ink}"
    rounded: "{rounded.md}"
    shadow: "{shadows.md}"
  hero:
    backgroundColor: "{colors.yellow}"
    border: "4px solid {colors.ink}"
    rounded: "{rounded.md}"
    shadow: "{shadows.lg}"
  badge:
    border: "2px solid {colors.ink}"
    rounded: "{rounded.pill}"
    font: "{typography.mono}"
    textColor: "{colors.ink}"
---

## Overview

**The Sticker Book Matchday.** A cream paper page with a faint ink dot grid, white cards with thick ink borders and hard offset shadows, and bright yellow hero surfaces that carry the loud moments. The energy is BeReal/Duolingo group-chat matchday — playful, hand-made, a little irreverent — with the trust machinery revealed at settlement, where the Proof Receipt is a split-panel hero: a yellow side shouting **PROVEN** under a trophy sticker, and a paper receipt side with the verifiable facts.

Source of truth: the Stitch project "FinalWhistle Social Betting App" (rebrand direction **xOdds**) and `brand.md`. It should **not** feel like a cold trading terminal or generic SaaS — no blur shadows, no gradient decoration, no identical icon-card grids.

## Colors

- **Cream** `#fff8ef` is the page; **Paper** `#ffffff` is every card; **Cream-2** `#f6edda` is the recessed fill (chat bubbles, muted containers). **Ink** `#1f1b10` is text, borders, shadows, and primary buttons.
- **Yellow** `#ffd600` is the brand surface: heroes, highlights, the winning Outcome card, receipt data bars. Ink text on yellow only.
- **Blue** `#0046fa` = links, odds, chat authors, focus rings, Locked. **Green** `#00873c` = Open, verified. **Red** `#d32f2f` = Void, errors.
- Pool state chips are tinted pills with a 2px ink border and an uppercase mono text label — open `#c8f7d8`, locked `#d1d7ff`, settled `#e2e2e2`, void `#ffdad6`. Color is never the only signal (AA).

## Typography

Three families, three jobs. **Anybody 900 italic uppercase** is the display voice — headlines, group names, the match banner, the pot, "PROVEN". **Hanken Grotesk** carries all body/UI text (buttons at 800 uppercase). **JetBrains Mono** is the "system-generated" voice: IDs, state chips, money meta rows, hashes, roots, tx signatures. Tabular numerals on money.

## Elevation

Flat fills + borders + hard offset shadows, no blur ever. Panels: 3px ink border, `4px 4px 0` shadow, 14px radius. Heroes: 4px border, `8px 8px 0` shadow. Buttons: 3px border, `3px 3px 0` shadow; hover *presses* — translate(2px,2px) and the shadow shrinks. Decorative stickers (emoji: 🏆 ⚽ 🏟️) sit rotated ±6–8° for the hand-placed feel.

## Components

- **Buttons.** Primary = ink fill, white text, uppercase. Secondary = paper fill, ink text. Hover = press-toward-shadow. Focus = 3px blue outline. Disabled = 0.5 opacity, no press.
- **Hero.** Yellow banner with 4px border: welcome pitch, the Group banner (name in display type + mono ID chip), the match banner (fixture name as an ink ribbon on yellow, prize tag rotated 2°).
- **Pool cards.** Grid of paper cards: display-type fixture title, state chip, dashed-rule mono meta rows (total pot, market), ink JOIN POOL bar. Whole card presses on hover.
- **Outcome cards.** Centered paper cards in a grid: display label, mono odds/entries line, full-width BACK button. Winner = yellow fill + "WINNER" chip.
- **Proof Receipt (the hero).** Split panel: yellow left with rotated white-on-ink-outline "PROVEN" + trophy sticker; right side has the final-score line (score in a yellow chip), the browser-verification banner (green/red tint), a bordered stats grid, and yellow mono bars for root / Merkle path / settlement tx.
- **Live Chat.** Panel with an ink header bar ("LIVE CHAT" in yellow + presence count), bordered cream message bubbles (author in blue), mono system lines, emoji reaction buttons.

## Do's and Don'ts

**Do** keep ink borders + hard shadows on every raised surface. **Do** pair every state color with its text chip. **Do** use mono for anything machine-generated. **Do** let yellow carry celebration (winner, receipt, heroes) and nothing else.

**Don't** use blur shadows, gradients, or glassmorphism. **Don't** put body copy in the display font. **Don't** signal Pool state by color alone. **Don't** drift back to dark-terminal or generic SaaS card grids.
