# Design language — "Ember"

**The screen is a night-light, not a lamp.** Lull is used in a dark bedroom in
the last hour before sleep. Everything is drawn from embers, candle-light, tea,
clay and dusk. There is almost no blue anywhere, by rule.

## Principles

1. **Low light, low arousal.** Warm near-black grounds, parchment ink, light
   that sits *inside* objects (lit embers) rather than glows around them.
2. **Slow, not sluggish.** UI responds instantly (press feedback 140ms,
   transitions ≤ 300ms). Only the *ambient* layer is slow: the horizon sun
   breathes at six breaths a minute.
3. **One metaphor: sunset.** A wind-down session is a sunset. The sun on Home
   sinks below the horizon as the session runs; a tiny sun in every game's
   title bar does the same. At the end: fade to black. No victory screen.
4. **Nothing competes.** No streaks, badges, red dots, leaderboards or timers
   counting down at you. Scores exist quietly, never celebrated loudly.
5. **Classic games, played straight.** Each game is a faithful classic with
   Lull's materials, not a reinvention.

## Colour

| Token | Hex | Use |
|---|---|---|
| `--c-night-0` | #0A0605 | App ground |
| `--c-night-1` | #120A07 | Sheets, wells |
| `--c-night-2` | #1B110C | Raised surfaces, empty cells |
| `--c-night-3` | #261811 | Pressed/selected surfaces |
| `--c-line` / `--c-line-soft` | #3A261C / #2A1B14 | Hairlines |
| `--c-ink` | #F1DCC4 | Primary text |
| `--c-ink-2` | #BC9B81 | Secondary text |
| `--c-ink-3` | #8A6E5B | Captions, labels (large or short text only) |
| `--c-ember` | #FF7A33 | The one accent: primary actions, focus |
| `--c-glow` | #FFB45E | Highlights, active states |
| `--c-candle` | #FFD9A0 | Hottest light (thumbs, sun core) |
| `--c-coal` | #5C2A16 | Banked heat, deep fills |

**Game hues** (`--p-*`): ember #E85A36 · saffron #F0973A · honey #E9C46A ·
moss #A2A55A · clay #B5694A · rose #D97A6C · sand #E9D3AE. Pieces are lit from
within: a top-light gradient (`linear-gradient(180deg, lighter, base)`), a 1px
inner highlight at the top, a soft dark inner edge at the bottom. No outer
neon glow.

## Type

- **Display:** Fraunces (variable, `SOFT` 100, light weights 330–420). Names,
  headings, big numbers. Soft serif = bedtime book, not dashboard.
- **UI:** Figtree (variable). Labels, body, buttons.
- Numbers that change use `.num` (tabular figures).
- Classes: `.t-display` 44 · `.t-title` 34 · `.t-heading` 22 · `.t-body` 16 ·
  `.t-small` 14.5 · `.t-caption` 12.5.

## Shape & depth

Radii 6/10/14/22/30. Cards rarely; hairline-separated rows instead. Elevation
is a soft, offset, dark shadow — never a coloured halo.

## Motion

- Curves: `--ease-out` (0.23,1,0.32,1) for enter/exit · `--ease-in-out`
  (0.77,0,0.175,1) for on-screen movement · `--ease-drawer` (0.32,0.72,0,1)
  for sheets and indicators.
- Press: `scale(0.97)` at 140ms. Sheets: 440ms drawer curve, flick to dismiss.
- Game pieces moving on a grid: 120–180ms ease-out translate. Merges/clears:
  a short brightness bloom (opacity/filter), never a bounce explosion.
- Ambient: 10s breath cycle on the horizon glow; embers drift 14–22s.
- Reduced motion: drop translation and scale, keep opacity.

## Voice

Short, plain, kind. "Wind down", "Start over", "Leave game". No exclamation
marks. No guilt ("Still up?" is the limit). Honest about science: binaural
beats are offered as soothing sound, not as medicine.
