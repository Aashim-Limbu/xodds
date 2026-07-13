# Brand — xOdds

_Status: active — derived from the Stitch project "FinalWhistle Social Betting App" (projects/1204182557696039212), rebrand direction "xOdds"._

## Name & voice

**xOdds** — "The Social Way to Bet." Matchday group-chat energy: playful, a little irreverent, sticker-book fun on top, provable trust underneath. Copy is short, loud where it counts (uppercase display moments), and human everywhere else.

## Style

Neo-brutalist sticker-book: cream paper background with a subtle ink dot grid, white cards with thick ink borders and hard offset shadows (no blur, no gradients-as-decoration), yellow hero surfaces, sticker-style rotations on decorative elements. State is always a text chip, never color alone.

## Colors

| Token | Hex | Use |
|---|---|---|
| cream / bg | `#fff8ef` | page background |
| paper | `#ffffff` | cards, panels |
| cream-2 | `#f6edda` | recessed containers, muted fills |
| ink | `#1f1b10` | text, borders, hard shadows, primary buttons |
| muted | `#4d4632` | secondary text (AA on cream/paper) |
| yellow | `#ffd600` | hero surfaces, highlights, winner, payout |
| yellow-deep | `#e9c400` | yellow hover/pressed |
| blue | `#0046fa` | links, odds, Locked state, info |
| green | `#00873c` | Open state, verified/win text |
| red | `#d32f2f` | Void, errors |

Chip tints (always with ink text + ink border): open `#c8f7d8`, locked `#d1d7ff`, settled `#e2e2e2`, void `#ffdad6`.

## Typography

- **Display:** Anybody 900 italic, uppercase, tight tracking — headlines, the pot, "PROVEN".
- **Body/UI:** Hanken Grotesk 400–800.
- **Data:** JetBrains Mono 600 — IDs, hashes, money meta, state chips.

Loaded via `next/font/google` as `--font-display`, `--font-body`, `--font-mono`.

## Depth

Flat fills + 3–4px ink borders + hard offset shadows (`4px 4px 0 ink`, `8px 8px 0` for heroes). Hover on buttons/cards: translate toward the shadow and shrink it (the "press"). No blur shadows, no glassmorphism.

## Hero moments

The Proof Receipt is the signature: split panel — yellow left with a giant rotated "PROVEN" + trophy sticker, receipt data right with yellow highlight bars for the on-chain fields.
