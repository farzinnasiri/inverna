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

## Data

All data is on-device under the `lull:` key prefix. Clearing site data resets
everything. There is no server, account or analytics.

## Deploy

Static assets on Cloudflare Workers: `pnpm deploy` (see `wrangler.jsonc`).
