# Design language — "Low Light"

**A phone that is already half asleep.** True black ground, quiet warm greys,
one muted sand accent used sparingly, flat matte surfaces, one typeface, and
every primary screen fits in one viewport with zero scroll.

## Principles

1. **Darkness is the material.** True `#000000` ground (OLED pixels off). Light
   only where there is information, dimmer than you think.
2. **One accent, rarely.** Muted sand (`#C4A57C`) marks at most one element per
   screen at rest. Most screens use no accent at all.
3. **Flat and precise.** Surfaces step by value (`bg → surface1 → surface2 →
   surface3`), edges are 1px hairlines. Zero UI gradients, zero bevels, zero
   Y-offset drop shadows, zero glows.
4. **The object is the title.** No screen titles, subtitles, essays, or hints.
   The bedtime clock, the sound orb, and the game tiles name themselves.
5. **One viewport.** No primary screen scrolls at 390×844.

## Colour

| Token | Value | Use |
|---|---|---|
| `--c-bg` | `#000000` | App ground, game ground |
| `--c-surface-1` | `#0E0D0C` | Sheets, sound orb ground, board wells |
| `--c-surface-2` | `#171614` | Tiles, controls at rest |
| `--c-surface-3` | `#22201D` | Selected/pressed states, fader tracks |
| `--c-line` | `rgb(232 224 212 / 0.08)` | Hairlines, tile borders |
| `--c-line-strong` | `rgb(232 224 212 / 0.14)` | Island edge, sheet top border |
| `--c-ink` | `#DAD4CB` | Primary text (warm stone, not white) |
| `--c-ink-2` | `#A8A198` | Secondary text, icons |
| `--c-ink-3` | `#7A746D` | Labels (≥13px/500) |
| `--c-ink-4` | `#4A4642` | Disabled, inactive strokes, grid dots |
| `--c-accent` | `#C4A57C` | Muted sand (at most one per screen) |
| `--c-accent-ink` | `#14110D` | Text on accent |
| `--c-accent-dim` | `#7D6A51` | Horizon disc, session rim arc |
| `--c-accent-wash` | `rgb(196 165 124 / 0.12)` | Hold-to-confirm fill |

**Night light:** Warmth shifts ink, accent, and piece tokens in OKLab via
`applyTokens({ warmth })` — never a colour overlay or `mix-blend-mode`. Dimming
is a plain `#000000` layer (`opacity = dim * 0.7`), so black stays `#000000` at
every light setting.

**Dusk stones (`--p-*`):** Matte, low-chroma (`<= 0.07` OKLCH), zero blue:
`clay #A6705B · ochre #B48F5E · straw #CBBA8F · sage #8B9372 · rosewood #9E6866 · stone #8A817A · bone #DCD2C2`.

## Typography

One UI family: **SF Pro** on Apple devices, **Inter Variable** elsewhere. No
serif. Five strict classes:

- `.t-hero` — 64/1.0, weight 200, `-0.03em`, `tnum` (time only)
- `.t-title` — 22/1.2, weight 600, `-0.015em` (sheet titles, onboarding questions)
- `.t-headline` — 16/1.3, weight 500, `-0.005em` (names, row labels)
- `.t-body` — 15/1.4, weight 400, `ink2` (at most one supporting line)
- `.t-label` — 13/1.25, weight 500, `ink3`, sentence case (never uppercase)

## Copy rules

1. One label per control — no hints under labels.
2. Never echo a value already shown by a control.
3. No counts, vanity badges, greetings, or periods on single-line UI text.
4. No new UI text without removing some.
