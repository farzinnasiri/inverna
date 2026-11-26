# Inverna v2: "Low Light" redesign

Status: proposal for the next engineering wave. Supersedes the visual rules in
`docs/DESIGN.md` ("Ember") once accepted. Game mechanics, engines, `calm`,
persistence and the sound synthesis stay exactly as they are. This is a design,
IA and copy change.

**The direction in one line:** Inverna should look like a phone that's already
half asleep: true black, quiet warm greys, one muted sand accent, flat surfaces,
one typeface, and every screen fits in one viewport.

---

## 1. Diagnosis: why v1 feels orange, loud, dated and vibe-coded

### 1.1 The rusty-brown screen is mostly a filter problem, not just the palette

The near-black ground (`#0A0605`) never reaches your eyes. Three things stack:

1. **A multiply wash that isn't multiplying.** `NightFilterOverlay` paints a
   full-screen `#ff5a14` layer with `mix-blend-mode: multiply`
   (`src/ui/styles/global.css:240`). Real multiply would leave black black.
   Your screenshots show a ground of roughly `#4A1C0E`, which is what you get
   from a *plain* orange sheet at ~27% opacity over `#0A0605`
   (0.27 × `#FF5A14` + 0.73 × `#0A0605` ≈ `#4C1D09`). So in this render the
   blend falls back to normal compositing (fixed layer inside an `isolation:
   isolate` group over an accelerated scroller, a known fragile combination).
   The result is a translucent orange sheet over the whole app.
2. **The schedule is always on and always wins.** `followBedtime` defaults to
   `true`, and `scheduleFilter()` jumps straight to `warmth 0.35` the moment
   the 45-minute lead window opens, rising to 0.9 (`src/core/night.ts:93`).
   `combineFilters()` takes the **max** per channel, so the user's own Warmth
   slider does nothing during the evening. Screenshot 6 shows this: Warmth
   at 13%, screen still brown. **That's a real bug.** The one control the user
   reached for has no visible effect.
3. **Default warmth is 0.2** (`src/ui/state/settings.ts:36`), so the wash is
   on at all hours, even before the schedule kicks in.

Even when multiply does work, it's the wrong tool. Multiplying by `#FF5A14`
keeps green at 35% and blue at 8%, so parchment ink turns orange, every piece
hue collapses into one orange family, and the whole UI becomes monochrome rust.

### 1.2 Everything that can be orange is orange

| Element | Where | Problem |
|---|---|---|
| Primary button | `components.css:51` `.btn--primary` | Glow→ember gradient, radial highlight, two inset bevels, orange halo shadow. A glossy 2012 iOS button, and the brightest object in the room |
| Horizon sun | `screens.css:60` | A 280px glowing orange disc as the hero. At night, the hero is a lamp |
| Slider | `.slider__fill` / `.slider__thumb` | Coal→ember→glow gradient track, candle radial "ball" thumb with drop shadow. Skeuomorphic |
| Toggles | `.toggle[aria-checked]` | Solid ember |
| Day pills | `.day[aria-pressed]` | Seven solid saffron discs, the loudest thing on Night |
| Active tab, selection, focus ring, caret | `global.css`, `.tab` | All glow/ember |
| Ambient room | `global.css:219` `.room` | Orange radial glow behind everything |
| Swatches | `NightScreen` | Five saturated colour bars that mean nothing |

The `color` tokens (`ember #FF7A33`, `glow #FFB45E`, `candle #FFD9A0`) are
light *sources*, and v1 used them as the UI's interactive colour. In a dark
bedroom, every control became a little lamp.

### 1.3 Fake depth reads as "old iPhone"

- `DESIGN.md` literally specifies pieces "lit from within: top-light gradient,
  1px inner highlight, dark inner edge." That's the iOS 6 to Material 1 bevel,
  and it shows on Kindle tiles (screenshot 1), Hue tiles (`hue.css:49`) and
  Settle cells.
- Recessed wells: `.kindle-slot` has inset shadows, `.kindle-board` adds a
  `0 22px 48px` drop shadow. Wells inside wells.
- `.seg__indicator`, `.toggle::after`, `.slider__thumb` and `.nowplaying` all
  carry drop shadows on a black ground where shadows can't be seen anyway.
  They only add muddiness.
- The tab bar is a full-width, edge-to-edge strip with a gradient fade and a
  4px dot under the active item. That's the iOS 7–17 pattern. Current iOS uses
  a floating capsule.

### 1.4 Fraunces everywhere

Fraunces with `SOFT 100` is a cosy bookish serif. Used for the greeting, screen
titles, group headings, every game name, game titles and score numerals, it
gives the whole app a Notion-template or recipe-blog voice. It also competes
with Figtree: two voices on every row (screenshot 2: serif "Settle" next to
sans "Falling blocks"). Big serif numerals in a 2048 grid (screenshot 1) look
like a wedding invitation.

### 1.5 Walls of explanatory text (the core "vibe-coded" smell)

The app explains itself at every level:

- **Game row = four text levels:** name, classic, one-line description, mental
  effect. Five rows make 20 text runs, so Home is about 2.5 screens tall.
- **Screen heads with essays:** "Take the blue out of the glass and set when
  your evening slows down." / "Synthesised live on your device. No downloads,
  no loops."
- **Group title plus group note:** "Night light / Applies across every game
  and screen." "Mixer / Blend your own room."
- **Label plus hint on every row:** "Bedtime / When you want the phone put
  away".
- **Values echoed three times:** "Length … 15 min", then a segmented control
  showing **15m**, then a button reading "Begin **15**-minute wind-down".
  "Start warming before … 45 min" sits above a segmented control showing
  **45m**.
- **Vanity counts:** "Games · 5 ready", "Also in the collection · 5 planned".
- **Greeting with a period:** "Quiet hours." is a copywriting tic.

### 1.6 Sounds and Night are settings forms, not experiences

- **Sounds** has about 19 controls in one scroll: 5 presets, timer, 4 bands
  (one labelled "Not for bedtime"), 2 engineering sliders (Base pitch
  **188 Hz**), a disclaimer card and 7 identical horizontal sliders. It's
  about three screens tall and has no visual of the sound at all. The most
  sensory part of the product has the least visual detail.
- **Night** has 11 controls across 4 groups and about 2.5 screens: warmth,
  dim, meaningless swatches, auto toggle, time, lead time, 7 day pills, .ics
  export, game sounds, haptics and data reset. It's a preferences pane, and
  it's a whole tab.

---

## 2. The new visual system: "Low Light"

### 2.1 Principles (replace DESIGN.md §Principles)

1. **Darkness is the material.** True black ground. Light only where there is
   information, and dimmer than you think.
2. **One accent, rarely.** Muted sand marks the single "lit" thing on a
   screen. Most screens use no accent at all.
3. **Flat and precise.** Surfaces step by value, edges are 1px hairlines.
   No gradients on UI, no bevels, no drop shadows, no glows.
4. **The object is the title.** No screen titles or subtitles. The bedtime,
   the sound orb and the game tiles name their own screens.
5. **One viewport.** No primary screen scrolls on a 390×844 phone. On a
   375×667 phone it may scroll by less than one tile row.

### 2.2 Palette (exact tokens)

Replace `color` in `src/design/tokens.ts`. Keep the `--c-*` CSS prefix.

| Token | Hex | Use |
|---|---|---|
| `bg` | `#000000` | App ground, game ground, sheets' backdrop. True black: OLED pixels off |
| `surface1` | `#0E0D0C` | Sheets, onboarding panels |
| `surface2` | `#171614` | Tiles, controls at rest, island fill (pre-blur) |
| `surface3` | `#22201D` | Selected/pressed, segmented indicator, slider track fill-less part |
| `line` | `rgb(232 224 212 / 0.08)` | Hairlines, tile edges |
| `lineStrong` | `rgb(232 224 212 / 0.14)` | Focus-adjacent edges, island edge |
| `ink` | `#DAD4CB` | Primary text, ~14:1 on black. Warm stone, deliberately not white |
| `ink2` | `#A8A198` | Secondary text and values, ~8:1 |
| `ink3` | `#7A746D` | Labels at ≥13px/500 on `bg` only, ~4.6:1 |
| `ink4` | `#4A4642` | Disabled, inactive glyph strokes, grid dots |
| `accent` | `#C4A57C` | Sand. Slider fill, active toggle, primary button fill, bedtime marker |
| `accentInk` | `#14110D` | Text/icons on `accent` |
| `accentDim` | `#7D6A51` | Accent at rest, progress tracks |
| `accentWash` | `rgb(196 165 124 / 0.12)` | Selected-chip background, hold-fill |

**Removed:** `ember`, `glow`, `candle`, `coal`, `night0–3`, `lineSoft`.
Grep-replace map for the migration: `night0→bg`, `night1→surface1`,
`night2→surface2`, `night3→surface3`, `lineSoft→line`, `line→lineStrong`;
`ember/glow→accent`, `candle→ink`, `coal→accentDim`.

**Rules**

- The accent appears on **at most one element per screen at rest**: the active
  slider fill, the "Start" button, or the bedtime marker. Never on tab labels,
  icons, selection, or focus rings. Focus ring is `2px ink2`.
- No colour gradients on UI. The only gradients allowed are inside the
  generative sound visual and the horizon line fade.
- Text selection: `rgb(196 165 124 / 0.25)` with `ink`. Caret: `ink2`.
  Scrollbar thumb: `surface3`.
- Delete `.room` entirely. The ground is `#000`.

### 2.3 The night light, done properly

**Goal:** lower brightness and blue emission without tinting black.
Black × anything = black, so the right approach never adds colour on top.

**Remove** `.night-filter__warm` and every `mix-blend-mode`. Replace with two
mechanisms:

1. **Warmth is a token transform, not an overlay.** Everything Inverna draws
   comes from tokens, including Pond's canvas colours. So warmth becomes an
   argument to `applyTokens({ warmth })`. It lerps each light token (`ink*`,
   `accent*`, `pieces.*`) in OKLab toward its warm twin. At `warmth = 1`:
   - `ink #DAD4CB → #D9C6A8` (blue channel 203 → 168)
   - `ink2 #A8A198 → #A8977D`
   - pieces shift about 25% toward amber and lose about 10% lightness

   `bg` and `surface*` are untouched, so black stays black. Implement the lerp
   in `tokens.ts` as plain TS (no DOM) so React Native can reuse it. Re-apply
   only when the rounded value changes (steps of 0.02). Changes at that size
   are invisible, so no colour transitions are needed. Pond and any canvas
   read colours through a tiny `useTokenColors()` hook that re-renders on
   change.
2. **Dim is a plain black layer.** Keep `.night-filter__dim` with normal
   blending, `opacity = dim × 0.7`. It's robust on every browser, costs
   nothing, and dims ink and pieces uniformly while black stays black.

**One user control, "Light".** Collapse Warmth + Extra dim into a single value
`light` (0 = normal, 1 = lowest) and derive the two channels from it:
`warmth = light`, `dim = 0.6 × light`. People think "darker", not "warmer
versus dimmer".

**Fix the precedence.** The schedule must deepen *from* the user's level,
never replace it:

```
evening  = light                                  // user's choice, always applied
schedule = followBedtime ? light + (1 - light) * 0.5 * smooth(progress) : light
session  = sessionLevels(...)                     // as today, final fade to black
final    = max(schedule, session)                 // per channel, as today
```

Default `light = 0.3`, set in onboarding. Settings migration (persist
`version: 2`): `light = max(warmth, dim / 0.6)`, then drop `warmth`/`dim`
from the store. `core/night.ts` keeps `NightFilter {warmth, dim}` as the
output type, so `combineFilters` and its tests stay.

Honest limit, for us and not for the UI: a web app can't touch hardware
brightness or system Night Shift. Token warmth plus dim is the most we can do,
and it's enough because the palette already starts low-blue.

### 2.4 Surfaces, shape, depth

- **Elevation is value, not shadow.** `bg → surface1 → surface2 → surface3`.
  Delete every `box-shadow` that has a Y offset, except the sheet's top edge,
  which uses a 1px `lineStrong` border and nothing else.
- **Edges:** 1px `line` on tiles. No inset highlight lines.
- **Radii:** `xs 6 · sm 10 · md 14 · lg 20 · xl 28 · pill 999`. Tiles use
  `lg 20`. Game cells use `sm 10`. Pills only for buttons ≤ 44px tall and the
  tab island.
- **Translucency is earned once:** the tab island and the in-game pause sheet
  backdrop. Recipe: `background: rgb(23 22 20 / 0.72); backdrop-filter:
  blur(24px) saturate(130%); border: 1px solid lineStrong`. No other blur
  anywhere.
- **Icons:** Lucide, `strokeWidth 1.5`, size 20 (tabs, controls) or 22
  (top-bar actions). Colour `ink2`, active `ink`. Never accent-coloured.

### 2.5 Typography: one family, five roles

**Family:** the platform's own UI face on Apple, Inter elsewhere.

```ts
font.ui = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter Variable', system-ui, sans-serif"
```

- On iPhone and Mac this resolves to **SF Pro**, which is literally the current
  iOS voice, costs zero bytes, and has optical sizes, tabular figures and thin
  weights for the clock numerals.
- On Android and Windows it falls to **Inter Variable**
  (`@fontsource-variable/inter`, the `opsz` build, latin subset only), which
  is metric-close to SF. The webfont downloads only where it's used.
- **Remove** `@fontsource-variable/fraunces` and `@fontsource-variable/figtree`,
  and delete `--font-display`. No serif anywhere. Hierarchy comes from size,
  weight and ink step only.

Strict scale. These five classes replace `.t-display/.t-title/.t-heading/
.t-body/.t-small/.t-caption/.t-serif`:

| Class | Size / line | Weight | Tracking | Ink | Use |
|---|---|---|---|---|---|
| `.t-hero` | 64 / 1.0 | 200 | -0.03em | `ink` | Time only: countdown, bedtime, timer. Always `tnum` |
| `.t-title` | 22 / 1.2 | 600 | -0.015em | `ink` | Sheet titles, onboarding questions, game top bar |
| `.t-headline` | 16 / 1.3 | 500 | -0.005em | `ink` | Names: games, presets, row labels |
| `.t-body` | 15 / 1.4 | 400 | 0 | `ink2` | The one supporting line a screen may have |
| `.t-label` | 13 / 1.25 | 500 | 0 | `ink3` | Values, captions, score labels. Sentence case, **never uppercase + tracked** |

**Copy rules (enforce in review):**

1. **One label per control.** No hints under labels. If a label needs a hint,
   rename the label.
2. **At most one `t-body` line per screen.** Zero on Home and Sounds.
3. **Never echo a value.** A segmented control shows its own value. Don't
   repeat it in a heading or a button ("Start", not "Begin 15-minute
   wind-down").
4. **No counts or meta** ("5 ready", "planned").
5. **No periods on single-line UI text.** No greetings.
6. **Delete `GameMeta.line` and `GameMeta.effect` from the UI.** Keep the data
   if you like, but no screen renders it. `classic` appears once: on the
   game's own pause sheet.

### 2.6 Game pieces: "Dusk stones"

Matte, desaturated, value-separated. Flat fill, no gradient, no inner
highlight, no shadow. Pieces separate from each other by a 2px gap of `bg`,
not by bevels.

| New key (`--p-*`) | Hex | Replaces | L* (approx) |
|---|---|---|---|
| `clay` | `#A6705B` | ember | 52 |
| `ochre` | `#B48F5E` | saffron | 62 |
| `straw` | `#CBBA8F` | honey | 76 |
| `sage` | `#8B9372` | moss | 60 |
| `rosewood` | `#9E6866` | clay | 50 |
| `stone` | `#8A817A` | rose | 55 |
| `bone` | `#DCD2C2` | sand | 85 |

Chroma is capped at about 0.07 (OKLCH). No blue, cyan or violet, as before.
When `light > 0` they warm through the token lerp in §2.3.

**Per game**

- **Settle:** flat cells in the 7 stones, `radius 4`, 2px `bg` gap. Ghost
  piece is a 1px `ink4` outline, no fill. Board well is `surface1` with no
  border. Line clear is a 220ms opacity fade to `bone`, then out. Replace the
  "ember dissolve" with a plain fade.
- **Hue:** board corners pinned to two stone pairs, interpolated in OKLCH with
  chroma ≤ 0.07, lightness spanning 25→80. **Constraint:** keep ΔE(OK) ≥ 0.04
  between neighbours or the puzzle becomes unreadable; the engine's colour
  generator owns this. Locked anchor tiles get a small `ink` dot at the
  centre, not an inset ring.
- **Thread:** endpoints are 60% cell-size discs in the stones. Paths are 40%
  cell-size strokes in the same stone at 0.55 opacity, round caps. Grid dots
  are `ink4`. Since several stones sit close in value, Thread must also give
  each pair a distinct endpoint *shape* (disc, ring, square, diamond) so
  colour-blind players can solve it.
- **Kindle:** a single value ramp from ash to bone. No hue changes, so "glows
  brighter" is honest:

  | 2 | 4 | 8 | 16 | 32 | 64 | 128 | 256 | 512 | 1024 | 2048 |
  |---|---|---|---|---|---|---|---|---|---|---|
  | `#1E1C1A` | `#2A2723` | `#3A352F` | `#504840` | `#6B5F51` | `#857561` | `#A08B70` | `#B9A282` | `#CDB998` | `#DDCDB2` | `#EAE0CC` |

  Numerals use `ink2` up to 64, `accentInk` from 128. Font is the UI face,
  weight 500, `tnum`. Empty slots are `surface1` with no border. The board has
  no frame: just the grid on black.
- **Pond:** water is `bg`. The koi becomes a pale bone/straw fish with ochre
  markings, drawn flat. Light motes are `accent` at 0.35 alpha, at most 12 on
  screen. Leaves are `surface3`. Remove the orange body gradient
  (`PondScreen.tsx:421`).

**Game shell** (`GameShell.tsx`): top bar is back · `t-title` 17/600 name ·
pause. Stats shrink to one centred `t-label` line: `8 · best 120`. Drop the
second stat ("Highest" duplicates what's on the board) and the bottom-left
"Best" duplicate. The mini-sun in the title goes. Undo becomes an icon button
with its count as a `t-label` beside it, no pill border.

### 2.7 Motion

Keep the house curves and the 140ms press rule. Changes:

- **Tab island indicator:** spring (`stiffness 500, damping 40`), shared
  layout so it slides between segments and stretches when the Sounds segment
  morphs (§3.1).
- **Sheets:** spring with velocity-aware flick to dismiss. The existing
  `Sheet` primitive is good: restyle it, don't replace it.
- **Ambient:** only the sound field (§3.3) and the horizon line (§3.2) move
  on their own. Delete the embers and the sun's breathing glow.
- **Reduced motion:** the sound field renders one static frame and the horizon
  disc stops moving.

---

## 3. Information architecture: fewer surfaces, zero scroll

### 3.1 Navigation: floating pill island plus a Night button

**Cut the Night tab.** Bedtime and light are set once (in onboarding) and
nudged occasionally. That's a sheet, not a destination. Navigation becomes the
current iOS pattern used by Photos: a 2-segment tab island plus a detached
circular action button.

```
                                  bottom safe area + 10px
  ╭───────────────────────────────╮   ╭──────╮
  │ ▣ Play      │   ≋ Sounds     │   │  ☾   │
  ╰───────────────────────────────╯   ╰──────╯
     island 236×52, radius 26           52×52 circle
```

**Anatomy**

- **Island:** height 52, padding 4, radius 26. Two segments, each `min-width
  112`, height 44 (the hit target), content = icon 20 + label `t-headline`
  15/500, horizontal, gap 8. The group is centred, with a 10px gap to the Night
  button. Bottom offset `max(env(safe-area-inset-bottom), 12px) + 10px`.
- **Surface:** the translucent recipe from §2.4. No drop shadow.
- **Active indicator:** a capsule behind the active segment,
  `rgb(232 224 212 / 0.10)`, inset 4, springing between segments. Active
  label/icon is `ink`, inactive is `ink3`. **No accent, no dot.**
- **Night button (☾):** same material, 52×52, Lucide `Moon` 22. Opens the
  Night sheet (§3.4). During a wind-down session, a 2px `accentDim` arc on
  its rim shows session progress. That's the only progress indicator in the
  chrome.
- **Now playing merges into the island.** Delete `NowPlayingBar`. When a sound
  is playing, the Sounds segment morphs: the icon becomes three 2px live level
  bars (the existing `np-bar` animation, recoloured `ink2`), and the label
  becomes the preset name ("Rainfall", or "Custom"), truncated at 14
  characters. The island widens with the spring, up to 268px. One bar, never
  two. Stopping is one tap away on the Sounds screen (tap the orb), and the
  sleep timer and wind-down stop it anyway.
- The island hides while a game is open, as today (the game overlay covers it).
- Page bottom padding becomes `52 + 10 + safe-bottom + 16`.

`Tab` type becomes `'play' | 'sounds'`. `nav.ts` gains
`nightOpen / setNightOpen`.

### 3.2 Home (Play): one viewport

```
 390 × 844 (usable ≈ 390 × 763)
┌──────────────────────────────────────┐
│                                      │  24
│                                      │
│              43 min                  │  t-hero 64/200, ink
│            until 11:00               │  t-label, ink3
│ ───────────────(●)────────────────── │  horizon: 1px line, 10px disc
│                                      │  24
│        ╭─────────────────────╮       │
│        │  ☾  Wind down        │       │  40px pill, surface2, ink
│        ╰─────────────────────╯       │
│                                      │  32
│ ╭──────────────────────╮ ╭─────────╮ │
│ │ ▦▦                   │ │  ▦      │ │  row 1: Continue tile (2 cols)
│ │ ▦▦▦   live mini-board│ │  ▦▦     │ │         + one game tile
│ │ Kindle               │ │ Hue     │ │  each 110 tall
│ ╰──────────────────────╯ ╰─────────╯ │  gap 8
│ ╭─────────╮ ╭─────────╮ ╭─────────╮  │
│ │  glyph  │ │  glyph  │ │  glyph  │  │  row 2: three square tiles
│ │ Settle  │ │ Thread  │ │ Pond    │  │
│ ╰─────────╯ ╰─────────╯ ╰─────────╯  │
│                                      │
│                                      │
│    ╭───────────────────────╮ ╭───╮   │
│    │ ▣ Play   │ ≋ Sounds   │ │ ☾ │   │
│    ╰───────────────────────╯ ╰───╯   │
└──────────────────────────────────────┘
```

About 24 + 110 + 24 + 40 + 32 + 228 ≈ 460px of content. It fits a 375×667
phone with room to spare.

**Hero: the bedtime clock (replaces greeting, sun and banner).**

| State | Big number | Label |
|---|---|---|
| > 3h before bedtime | `11:00` | `Bedtime` |
| ≤ 3h before | `43 min` | `until 11:00` |
| Past bedtime | `11:24` (now) | `Past bedtime` |
| Wind-down running | `12 min` | `Winding down` |

**Horizon:** keeps the sunset metaphor, drawn as geometry. A 1px `line`
hairline across the content width with a 10px `accentDim` disc sitting on it,
plus a 1px vertical fade below the disc. The disc's x-position tracks the
evening, from left at lead start to centre at bedtime. During a session it
sinks below the line, as the sun does today. No glow, no gradient sky, no
embers. Rewrite `Horizon.tsx`. The `--set` contract stays.

**Wind-down entry:** one 40px pill, `surface2` with a `line` edge, `ink`,
`Moon` 18 + "Wind down". Tap opens the sheet (§3.5). While a session runs it
becomes `End` (ink2, same pill) and the hero shows the countdown. Delete
`.session-card`, since the hero already shows the time left.

**Games: a 3-column tile grid, names only.**

- Tile: `surface2`, 1px `line`, radius 20, padding 14. A flat 2-tone glyph
  (32px, `ink2` and one stone) sits top-left; the name in `t-headline` sits
  bottom-left. **No subtitle, description, effect or chevron.**
- **The Continue tile:** the most recently played game with resume state
  takes the 2-column slot and draws a **live miniature of the saved board**
  (Kindle grid, Settle stack, Hue mosaic, Thread grid, Pond water) at 30%
  scale from the `useGameSave` blob. That's real visual richness with no
  text. With no history (first run), the 2-wide slot goes to Settle with its
  glyph. Ship the glyph version first and the mini-board as P3.
- Order is the Continue game, then catalog order.
- **"Soon" games don't appear.** No "Also in the collection", no "Next" tags.
  We don't promise what isn't built. When a game ships, the grid gains a row.

### 3.3 Sounds: a soundscape instrument

The synthesis is the best part of Inverna, and the screen should look like it.

```
┌──────────────────────────────────────┐
│                                      │
│                                      │
│          ·  ╷   ╷ ·    ╷             │
│      ╭──────────────────────╮        │
│     │   ╷  ·  ╷     ╷   ·    │       │  SoundField canvas
│     │ ·    ╷     ·  ╷    ╷   │       │  orb Ø 260, live generative
│     │  ～～～～～～～～～～～  │       │  tap = play / stop
│     │ ～～～～～～～～～～～～ │       │  swipe ⇆ = change preset
│      ╰──────────────────────╯        │
│                                      │
│   Low tide   Rainfall   Hearth  Dee… │  mode strip (camera-style)
│                 ‾‾‾‾                 │  centred = selected, ink; others ink4
│                                      │
│     ╭───────────╮   ╭───────────╮    │
│     │ ◷  30 min │   │ ⫶  Mix    │    │  two 40px pills, surface2
│     ╰───────────╯   ╰───────────╯    │
│                                      │
│    ╭───────────────────────╮ ╭───╮   │
│    │ ▣ Play   │ ≋ Rainfall │ │ ☾ │   │
│    ╰───────────────────────╯ ╰───╯   │
└──────────────────────────────────────┘
```

- **No title or subtitle.** The orb is the screen.
- **`SoundField`** (new, `src/ui/components/SoundField.tsx`) is a 2D canvas,
  DPR capped at 2, 30fps, paused when the tab is hidden. It's driven by the
  current `Mix` gains, not an audio analyser, so it's deterministic, cheap,
  and needs no engine change. Each layer has a visual voice, all in `ink3`,
  `ink4`, `bone` or `accent`, at low alpha, clipped to a 260px circle on
  `surface1`:
  - **Rain:** short 1px vertical strokes falling, count ∝ gain (max 70).
  - **Waves:** 2–3 slow sine bands across the lower third, period 8–12s.
  - **Hearth:** a few motes rising with soft flicker (`accent`, max 10).
  - **Wind:** long thin arcs drifting sideways.
  - **Brown/pink/white noise:** grain density and size (brown = larger,
    darker, sparser; white = fine, denser).
  - **Binaural band:** a single ring breathing on the 10s `breath` cycle.
    Decoupled from beat Hz; a 2Hz pulse is too busy to look at.
  - **Stopped:** the field freezes at 40% opacity and a `Play` glyph (24,
    `ink2`) appears centre. Tap the orb to start (that tap is also the
    `sound.unlock()` gesture).
- **Mode strip:** a horizontal scroll-snap list of preset names
  (`t-headline`). The centred one is selected and `ink`, neighbours `ink4`,
  like the iOS camera mode picker. Swiping the orb drives the strip too.
  "Custom" appears at the end only once the user has edited a mix. Selecting
  while playing crossfades (the engine already does 1.5s).
- **Timer pill:** `◷ 30 min`. Tap opens a 5-option menu (Off, 15, 30, 45, 60)
  as a small popover, not a segmented row on the page.
- **Mix pill** opens the **Mix sheet**:

```
 Mix sheet (≈ 420px, no scroll)
┌──────────────────────────────────────┐
│               ───                    │
│  Mix                                 │  t-title
│                                      │
│   ┃    ┃    ┃    ┃    ┃    ┃    ┃    │  7 vertical faders
│   ┃    ┃    █    ┃    ┃    ┃    ┃    │  36 wide × 180 tall, radius 18
│   █    █    █    ┃    █    ┃    ┃    │  fill = accent at 0.8 when > 0
│   █    █    █    ┃    █    ┃    ┃    │  surface3 track
│  Rain Waves Fire Wind Brown Pink White│  t-label under each
│                                      │
│  Tone   Off · Delta · Theta · Alpha  │  segmented, surface1/3
│  Headphones. Evidence is mixed.      │  t-label, one line, only when ≠ Off
└──────────────────────────────────────┘
```

  - Vertical faders read as a mixing desk: tactile, scannable, and all 7 fit
    in one row.
  - **Cut:** Gamma (our own catalog says "Not for bedtime"), Base pitch
    (an engineering parameter), the separate Tone-level slider (binaural gain
    follows the preset's `bandGain`; if users ask for it, add an 8th fader),
    and the disclaimer card (one line now).
  - Editing any fader sets the strip to "Custom".

### 3.4 Night: a sheet, not a tab

The ☾ button opens it. It fits in one sheet with no scroll:

```
┌──────────────────────────────────────┐
│               ───                    │
│                                      │
│  ╭────────────────────────────────╮  │
│  │███████████░░░░░░░░░░░░░░░  ☀︎  │  │  Light: Control-Center slider
│  ╰────────────────────────────────╯  │  56 tall, radius 18, live
│                                      │
│               11:00                  │  t-hero; tap → time wheel
│              Bedtime                 │  t-label
│                                      │
│  Dim before bed                 (●)  │  t-headline + toggle
│ ──────────────────────────────────── │
│  More                             ›  │  pushes a second page in-sheet
└──────────────────────────────────────┘
```

- **Light slider:** a single 56px-tall rounded rectangle. The fill is
  `surface3`, the track `surface1`, and a sun glyph at the end goes `ink2`
  → `ink4` as you drag. It previews live because the filter is global, so
  dragging *is* the preview. No percentage readout.
- **Bedtime:** the big number is the control. Tap opens the native time
  input (iOS shows a wheel). No pill, no clock icon.
- **Dim before bed:** one toggle. Lead time is fixed at 45 minutes.
- **More ›** pushes, inside the same sheet, to: Game sounds (toggle), Haptics
  (toggle), Add to calendar (row → `.ics`), Re-tune Inverna (re-runs
  onboarding), and Forget everything (the existing `HoldButton`, restyled with
  an `accentWash` fill). Each is one line with no hint text. The on-device
  privacy note becomes the confirm text of the hold button ("Hold to erase
  progress and settings on this phone").

**Cut from Night:** the Warmth/Extra dim pair (merged into Light), the
swatches, "Start warming before" (fixed 45m), the **Evenings** day picker (every
night; `schedule.days` stays all-days in data), and all section titles and
notes.

### 3.5 Wind-down sheet

```
┌──────────────────────────────────────┐
│               ───                    │
│  Wind down                           │  t-title. No paragraph
│                                      │
│  ╭──────────────────────────────╮    │
│  │ 10   │  15  │  20   │  30    │    │  segmented, minutes implied
│  ╰──────────────────────────────╯    │
│                                      │
│  Sound                    Rainfall › │  row; tap cycles via a menu
│                                      │
│  ╭──────────────────────────────╮    │
│  │            Start              │    │  48px, accent fill, accentInk
│  ╰──────────────────────────────╯    │
└──────────────────────────────────────┘
```

Defaults come from onboarding: length 15, sound = their chosen sound. That
makes the common path two taps (pill → Start). The "fades to black" promise
lives in the behaviour, not in a paragraph.

---

## 4. Onboarding: "Tune Inverna to your night"

Three full-screen steps on black, about 15 seconds total, shown on first
launch when `settings.onboarded !== true`. **No welcome screen, no feature
tour, no explanations.** Each step is one question, one control, one button.
A **Skip** link (`t-label`, `ink3`) sits top-right on every step; skipping
sets defaults and `onboarded = true`. Progress is three 4px dots at top
centre (`ink` current, `ink4` others). Transitions are a 260ms crossfade
plus 12px horizontal slide.

### Step 1: Bedtime

```
│                                 Skip │
│               ● ○ ○                  │
│                                      │
│   When do you want to be asleep?     │  t-title, centred
│                                      │
│              10:30                   │
│           ▸  11:00  ◂                │  custom wheel, t-hero centre row,
│              11:30                   │  15-min steps, ink → ink4 fade
│                                      │
│  ╭──────────────────────────────╮    │
│  │           Continue            │    │  surface2 pill (not accent yet)
│  ╰──────────────────────────────╯    │
```

Writes `schedule.bedtime` and sets `followBedtime = true`.

### Step 2: Light (live preview)

```
│                                 Skip │
│               ○ ● ○                  │
│   How low should the light go?       │
│                                      │
│   ╭──────────────╮                   │  a real mini Kindle board +
│   │ ▦ ▦   ▦      │   11:00           │  a hero numeral, rendered with
│   │ ▦▦▦ ▦        │   Bedtime         │  real tokens, so the filter
│   ╰──────────────╯                   │  preview is the actual app
│                                      │
│  ╭────────────────────────────────╮  │
│  │█████████░░░░░░░░░░░░░░░░░  ☀︎   │  │  the same Light slider
│  ╰────────────────────────────────╯  │
│                                      │
│  ╭──────────────────────────────╮    │
│  │           Continue            │    │
│  ╰──────────────────────────────╯    │
```

The slider drives the global filter live, so the *whole screen* is the
preview, the button included. Writes `light`. Default 0.3.

### Step 3: Sound (live audio preview)

```
│                                 Skip │
│               ○ ○ ●                  │
│   What helps you drift off?          │
│                                      │
│  ╭──────────╮ ╭──────────╮           │  2 × 3 grid of 104px tiles
│  │  ·╷ ·╷   │ │  ～～～   │           │  each with a still SoundField
│  │ Rainfall │ │ Low tide │           │  thumbnail + name
│  ╰──────────╯ ╰──────────╯           │
│  ╭──────────╮ ╭──────────╮           │  tap = select + preview
│  │   ⋰ ⋰    │ │  ░░░◯    │           │  (0.8s fade-in, plays until
│  │ Hearth   │ │Deep drift│           │   the next tap / Done)
│  ╰──────────╯ ╰──────────╯           │
│  ╭──────────╮ ╭──────────╮           │
│  │  ·╷ ◯    │ │          │           │
│  │Theta rain│ │ Silence  │           │
│  ╰──────────╯ ╰──────────╯           │
│                                      │
│  ╭──────────────────────────────╮    │
│  │             Done              │    │  accent fill, the first accent
│  ╰──────────────────────────────╯    │  the user sees
```

The first tile tap is the audio-unlock gesture. Selected tile: `surface3` +
1px `lineStrong`. Writes `sessionPreset` and the Sounds screen's initial
preset. On Done, the preview keeps playing and fades out over 3s (or keeps
playing if they want it; it's their room). Then land on Home.

**Re-run:** Night sheet › More › Re-tune Inverna. It opens the same flow
pre-filled with current values.

**State:** `settings.onboarded: boolean` (persist v2). Component:
`src/ui/onboarding/Onboarding.tsx` with three step components. `App.tsx`
renders it above the frame when `!onboarded`.

---

## 5. What gets cut, merged or moved

| v1 | v2 |
|---|---|
| Night tab | **Cut.** Night sheet from the ☾ button |
| NowPlayingBar | **Merged** into the Sounds tab segment |
| Greeting "Quiet hours." + bedtime sentence | Bedtime clock hero |
| Orange sun, embers, sky gradient | Hairline horizon + 10px disc |
| "Begin wind-down" banner button | 40px "Wind down" pill |
| Session card | Hero countdown + "End" pill |
| Game rows (name/classic/line/effect/chevron) | Name-only tiles |
| "Also in the collection" / soon games | **Cut** from UI |
| Sounds title, subtitle, section titles, notes | **Cut** |
| Preset list rows with hints | Camera-style mode strip |
| Sleep timer segmented | Timer pill + popover |
| 4 binaural cards + Tone level + Base pitch | Tone segmented (3 bands + Off) in Mix sheet |
| Gamma band | **Cut** |
| Disclaimer card | One `t-label` line |
| 7 horizontal mixer sliders with hints | 7 vertical faders in Mix sheet |
| Warmth + Extra dim | One Light slider |
| Swatches | **Cut** |
| Start warming before (15/30/45/60) | **Cut** (fixed 45) |
| Evenings day pills | **Cut** (every night) |
| .ics button, game sounds, haptics, reset, privacy note | Night sheet › More |
| Wind-down paragraph + "Begin 15-minute wind-down" | Title + "Start" |
| Game stats (Score/Highest, uppercase) + Best footer | One `t-label` line |
| Fraunces, Figtree | SF Pro (Apple) / Inter (elsewhere) |
| Multiply orange filter | Token warmth + plain black dim |

---

## 6. Implementation plan for the engineering wave

Ordered so each wave ships something visibly better and nothing is broken in
between. The coordinator owns the shared files (`tokens.ts`, `App.tsx`,
styles, `DESIGN.md`) per `AGENTS.md` rule 9; game folders can be parallel
assignments in wave C.

### Wave A: Foundation (palette, type, filter). Biggest perceived win.

1. `src/design/tokens.ts`: new `color` and `pieces` (§2.2, §2.6), new
   `font.ui`, delete `font.display`, radii update, and
   `applyTokens({ warmth })` with an OKLab lerp toward warm twins (pure TS,
   unit-tested).
2. `src/core/night.ts` + `night.test.ts`: new schedule semantics (deepen from
   user `light`, §2.3). Add a test: "manual light is visible inside the lead
   window" (the bug from screenshot 6).
3. `src/ui/state/settings.ts`: `light`, `onboarded`, persist `version: 2`
   with migration; defaults `light 0.3`, `followBedtime true`.
4. `src/ui/components/NightFilterOverlay.tsx`: drop the warm layer, call
   `applyTokens({ warmth })` on rounded change, keep the dim layer
   (`opacity = dim × 0.7`).
5. `src/ui/styles/global.css`: remove `.room`, the Fraunces/Figtree variables
   and `.night-filter__warm`; `bg #000`; new type classes (§2.5); browser
   surfaces (selection, caret, focus, scrollbar).
6. `package.json` / `main.tsx`: remove the Fraunces and Figtree imports, add
   `@fontsource-variable/inter` (opsz, latin).
7. `src/ui/styles/components.css`: flat `.btn` variants (`primary` = accent
   fill, `quiet` = surface2 + line, no shadows), flat slider (surface3 track,
   accent fill, 22px `ink` thumb, no shadow), toggle (`accent` on, `surface3`
   off, `ink` knob), segmented (surface1 + surface3 indicator, no shadow),
   sheet (surface1, 1px top line, radius 28), remove `.nowplaying`.
8. `src/ui/hooks/useTokenColors.ts` (new): resolved token colours for
   canvases.

**Check:** run the app at warmth 0, 0.5 and 1 with the schedule on; sample the
ground pixel. It must be `#000000` in all three.

### Wave B: Navigation and IA

1. `src/ui/state/nav.ts`: `Tab = 'play' | 'sounds'`; add `nightOpen`.
2. `src/ui/App.tsx`: render `TabIsland` + `NightButton`; delete
   `NowPlayingBar`; mount `NightSheet`, `WindDownSheet`, `Onboarding`.
3. `src/ui/components/TabIsland.tsx` (new): island, spring indicator,
   Sounds-segment morph with live bars and preset name.
4. `src/ui/screens/HomeScreen.tsx` + `screens.css`: hero clock, horizon,
   Wind down / End pill, 3-column grid with a 2-wide Continue tile; delete the
   shelf, game rows, session card and soon list.
5. `src/ui/components/Horizon.tsx`: rewrite as the hairline + disc (§3.2).
6. `src/ui/components/GameGlyph.tsx`: flat 2-tone glyphs (`ink2` + one stone).
7. `src/ui/components/WindDownSheet.tsx`: §3.5.
8. `src/ui/screens/NightScreen.tsx` → `src/ui/components/NightSheet.tsx`:
   §3.4 with in-sheet push to More. Delete the screen.
9. `src/ui/components/controls.tsx`: add `LightSlider` (the 56px
   Control-Center style) and `Menu`/popover; restyle the rest via CSS.

**Check:** on 390×844 and 375×667 viewports, Home, Sounds, Night sheet and
Wind-down sheet show no scrollbar (`scrollHeight <= clientHeight`).

### Wave C: Sounds instrument and games (parallelisable)

1. `src/ui/components/SoundField.tsx` (new): §3.3 canvas.
2. `src/ui/screens/SoundsScreen.tsx`: orb, mode strip, timer pill + menu, Mix
   pill.
3. `src/ui/components/MixSheet.tsx` (new): 7 vertical faders + Tone
   segmented.
4. `src/core/sound/catalog.ts`: remove `gamma` from `BANDS` (keep the type
   tolerant of old saved mixes by mapping `gamma → null`).
5. Game skins, one assignment each: `games/kindle/kindle.css` (value ramp,
   no frame, no inset), `games/settle/settle.css` (flat stones, fade clear),
   `games/hue/hue.css` (flat tiles, dot anchors, plus a ΔE check in the core
   generator), `games/thread/thread.css` + `ThreadScreen.tsx` (endpoint
   shapes), `games/pond/PondScreen.tsx` (pale koi via `useTokenColors`).
6. `src/ui/components/GameShell.tsx`: one-line stats, drop the mini-sun and
   footer duplicates.

### Wave D: Onboarding and polish

1. `src/ui/onboarding/Onboarding.tsx` + `StepBedtime.tsx`, `StepLight.tsx`,
   `StepSound.tsx`, and a `TimeWheel` control.
2. Wire "Re-tune Inverna" in Night › More.
3. P3: live mini-board on the Continue tile (read the `useGameSave` blob and
   render a static miniature per game).
4. `docs/DESIGN.md`: rewrite as "Low Light" from this doc (§2 rules, tokens,
   type, copy rules). Update `AGENTS.md` rule 5's example variables
   (`var(--p-clay)`, `var(--c-surface-2)`) and add: "No new UI text without
   removing some."

### Definition of done for the wave

- The ground pixel is `#000000` at every light level, with the schedule on or
  off.
- Zero `box-shadow` with a Y offset, zero `linear-gradient` on UI components,
  zero `mix-blend-mode` (`rg` for each returns only the allowed sound-field
  and horizon cases).
- No `.t-small`, `.row__hint`, `.group__note` or `t-display` left in `src/`.
- The accent appears at most once per screen at rest (visual check per
  screen).
- All primary surfaces have no scroll at 390×844.
- Onboarding completes in ≤ 4 taps with defaults, and Skip works from every
  step.
- `pnpm typecheck && pnpm test && pnpm build` pass.

---

## 7. Decisions for Farzin

These are the calls I've made that you may want to overrule. Each is cheap to
change later.

1. **Night as a ☾ button plus sheet, not a tab.** I'm confident: it's
   settings, and you said Night is too complicated. If you want it to stay a
   destination, it becomes a third island segment holding the same
   single-viewport content.
2. **SF Pro on Apple, Inter elsewhere, no serif at all.** This gives the
   "new iOS" feel you described for free. If you want a little more
   personality later, the place to add it is the hero numerals only, never
   names or headings.
3. **Upcoming games hidden.** It cuts clutter and promises nothing.
4. **Cuts:** Gamma, Base pitch, Evenings, lead time choice. All are
   reversible, and none touches the engine. If anyone asks for them back,
   they go in the Mix sheet or Night › More, not on a main surface.
