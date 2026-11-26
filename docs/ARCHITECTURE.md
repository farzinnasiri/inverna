# Architecture

```
src/
  core/                 Pure TS. Zero DOM, zero React. Ports to Expo as-is.
    storage.ts          KeyValueStore contract (sync; web=localStorage, native=MMKV)
    rng.ts              Seeded RNG — engines never call Math.random
    night.ts            Bedtime schedule + night-filter maths
    session.ts          Wind-down session curve (warmth, dim, volume, calm, fade)
    sound/catalog.ts    Layers, binaural bands, presets (pure data)
    sound/engine.ts     SoundEngine contract
    games/catalog.ts    The ten games (metadata)
    games/<id>/         One engine per game + tests
  platform/             The only place that touches device APIs
    index.ts            bootPlatform(), sound, haptics — swap this for native
    web/                localStorage, Web Audio, navigator.vibrate
  design/tokens.ts      Colours, type, radii, motion — shared with native
  ui/                   React DOM rendering
    components/         Design-system pieces + GameShell
    hooks/game.ts       Loop, save, calm, feedback, gestures, keys
    state/              zustand stores (zustand runs on React Native too)
    screens/            Home, Sounds, Night, wind-down session
    games/<id>/         One screen per game (renders engine state)
```

## Migration path to Expo / React Native

| Layer | Web today | Native later | Change needed |
|---|---|---|---|
| Game engines, rules, session curve, schedule | `src/core` | same files | none |
| Tokens | `src/design/tokens.ts` | same file | none |
| State | zustand + persist | zustand + persist | storage adapter only |
| Storage | localStorage | react-native-mmkv | one adapter |
| Audio | Web Audio API | react-native-audio-api (Web Audio–compatible) | near line-for-line |
| Haptics | navigator.vibrate | expo-haptics | one adapter |
| Game loop | rAF (`useGameLoop`) | Reanimated `useFrameCallback` | one hook |
| Rendering | DOM/CSS/SVG/canvas | RN views / Skia | rewrite screens only |
| Navigation | `ui/state/nav.ts` | expo-router tabs + stack | thin |
| Bedtime reminder | .ics calendar file | expo-notifications | one adapter |

## Engine contract (every game)

```ts
// src/core/games/<id>/engine.ts
export interface XState { /* plain JSON-serialisable data */ }
export function createX(opts: { seed: number; calm: number; ... }): XState
export function xReducer(state: XState, action: XAction): XState   // pure
export function tickX(state: XState, dtMs: number, calm: number): XState // only if real-time
```

Engines take `calm` (0..1). During a wind-down session it rises toward 1 and
games should get slower and gentler — never harder.

## Night backdrop (Play, Sounds, Settings)

Every sound preset has its own living scene (rain on a window, embers, moonlight
on water, Chladni sand, ...). `AmbientBackdrop` stacks two layers:

| Layer | Files | What it does |
|---|---|---|
| Colour | `src/ui/rn/AmbientBackdrop.tsx`, palettes in `src/core/backdrop/scenes.ts` | Palette-family glows and caustic rings, crossfaded over 1.6s |
| Scene | `src/core/backdrop/sim.ts` (simulation), `src/ui/rn/backdrop/` (Skia) | Particles, structures and a soft field shader |

- **Simulation** (`sim.ts`): one pool of particles shared by all 12 scenes. On
  a sound change a circular front grows from the dial; each particle it passes
  is handed to the new scene where it stands and blends to its new look, so
  shapes morph instead of crossfading. Pure TS worklets, unit tested.
- **Rendering**: `fieldShader.ts` (one SkSL shader, all scenes, drawn at ~1px
  per 1.5pt and scaled up), `draw.ts` (structures + one `drawAtlas` for all
  particles), `BackdropCanvas.tsx` (30 fps clock on the UI thread).
- **Audio link**: `platform/audio/motifEvents.ts` reports classical motif notes,
  so Nocturne strings sound with their notes, ink drops on each Reverie phrase
  and the Adagio plate changes with the harmony.
- **Web** loads CanvasKit (`public/canvaskit.wasm`, copied on `pnpm install`)
  before the Skia chunk; the rest of the app does not wait for it.
- Worklets must be defined above their callers (the worklet compiler captures
  dependencies at definition time). `backdrop/worklets.test.ts` enforces it.

## Evening, check-in and voice

- **Bedtime is the pivot.** `core/evening.ts` says where tonight stands (day,
  evening, winding, past, morning); Play's hero, its countdown and the check-in
  prompt all follow it.
- **Check-in** (`ui/rn/NightCheckIn.tsx`): two plain questions near bedtime.
  `core/tonight.ts` turns the answers into tonight's game order and two sound
  suggestions; the user never picks that themselves. Also opened from the
  Sounds page ("Not sure what fits tonight?") and from reminders.
- **Reminders** (`platform/notifications.ts`, `ui/rn/reminders.ts`): one
  notification a night at wind-down start, rotating messages, re-planned for
  the coming week whenever the app opens. Tapping one opens the check-in.
- **Personalization** has three layers, shortest-lived wins:
  onboarding sets the starting point (`core/profile.ts`: game intent,
  difficulty, sound order, default sound, volume, wind-down length); Play
  learns favourites from what is actually played (`core/games/arrange.ts`
  gives them the wide tiles); tonight's check-in overrides one night only.
- **Words** live in `ui/copy.ts`. Voice rules and the full copy deck:
  `design/copy/VOICE.md`, `design/copy/copy.json`.
- **Games** open on a door (difficulty, Continue / New game) in `GameShell`.
  Shared Easy / Medium / Hard feeds `useCalm(gameId)`; Nine, Rally and Hue
  keep their own difficulty. At bedtime a game asks once whether to stop,
  keep playing, or put the phone down (sound plays on, then fades).

## Data

All data is on-device under the `inverna:` key prefix. Clearing site data resets
everything. There is no server, account or analytics.

## Deploy

Static assets on Cloudflare Workers: `pnpm deploy` (see `wrangler.jsonc`).
