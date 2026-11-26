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

**Light & colour:** Warmth shifts ink, accent, and piece tokens in OKLab via
`applyTokens({ warmth })`, and a multiply layer over the whole app takes blue
(and some green) out of every pixel, like Night Shift. Multiply leaves black
`#000000`, so nothing turns muddy. Dimming is a plain `#000000` layer. Both
follow Adaptive light & colour (`adaptiveFilter` in `core/night.ts`) unless
the person sets the sliders by hand.

**Dusk stones (`--p-*`):** Matte, low-chroma (`<= 0.07` OKLCH), zero blue:
`clay #A6705B · ochre #B48F5E · straw #CBBA8F · sage #8B9372 · rosewood #9E6866 · stone #8A817A · bone #DCD2C2`.

## Glass and selection

Surfaces are Liquid Glass (`GlassSurface`). When something is selected,
chosen, suggested or is the main action, the glass itself turns warm: a brass
tint inside the glass (`GLASS_TINT` in `Glass.tsx`; `accent` on a surface does
it), with the same thin edge as every other surface. Never draw an outline or
glow around glass to mark a state: it stops reading as glass. Shades can differ
(selected, primary, suggested); the treatment doesn't. Primary and quiet
`Button`s are glass too. A control that switches something on (Wind down, the sound
pill on Play) is warm only while it's on, never to look important at rest.

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

## Haptics

Haptics confirm, they never decorate. They are for three things only: a value
that steps under your finger, something you did in a game, and the few actions
that change your night. Everything else is silent, as on iOS itself: buttons,
tabs, opening a sheet, moving between screens. Nothing you didn't cause is
felt: a brick breaking on its own, the far paddle in Rally, a wind down ending
by itself. Nothing in Inverna is a failure, so there is no warning or error buzz,
and nothing heavier than one medium tap.

There are five events (`feel(...)` in the app, `haptic(...)` in games), each
with one meaning everywhere. `tick` (the iOS selection tick) is a value
stepping: a wheel row, a slider detent, a segment, a toggle, a page of
onboarding, selecting a cell. `settle` (a soft tap) is something coming to rest
under your touch: a piece placed, the ball off your paddle, a long press
caught. `reward` (a light tap) is a small moment you earned: a line cleared, a
pair found, a lotus opened. `complete` (the success pattern) is a puzzle
solved, once per round. `commit` (a medium tap) is starting or ending a wind
down, putting the phone down, finishing onboarding or erasing everything. In
games each haptic goes with its sound cue (`tap` → `tick`, `place` →
`settle`, `clear` → `reward`, `chime` → `complete`; `undo` is never felt).

`Segmented`, `Toggle`, `PillSlider` and `TimeWheel` already tick, so don't add
another in their `onChange`. A gate (`core/hapticGate.ts`) drops repeats of the
same event that come too fast and doubles from one action, but always lets a
heavier event through, so a solve on the last move is still felt. Haptics are
always optional: Settings → Haptics turns them off, and nothing may depend on
them alone.
