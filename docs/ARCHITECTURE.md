# Architecture

```
src/
  core/                 Pure TS. Zero DOM, zero React (tsconfig.core.json).
    storage.ts          KeyValueStore contract (sync; expo-sqlite localStorage
                        on iOS, localStorage on web) and loadSaved()
    decode.ts           Checks for data read back from storage
    rng.ts              Seeded RNG: engines never call Math.random or Date.now
    night.ts            Bedtime schedule, nightKey, night-filter maths
    session.ts          Wind-down curve (warmth, dim, volume, calm, fade, end)
    reminderOffer.ts    When to offer the bedtime reminder
    sound/              Presets and layers (catalog), the descent arc, the
                        SoundEngine contract
    games/catalog.ts    The 13 games (metadata, difficulty kind)
    games/shell.ts      The game lifecycle GameShell runs on (door, sheets, pause)
    games/<id>/         One engine per game + tests
    backdrop/           The scene simulation (worklets)
  platform/             The only place that touches device APIs
    index.ts            bootPlatform(), sound, haptics, notifications
    audio/              The synthesis engine (Web Audio API shape)
    sound.native.ts     react-native-audio-api, audio session, Now Playing
    notifications.ts    Reminders (one serialized writer)
  design/tokens.ts      Colours, type, radii, motion
  ui/
    copy.ts             Every word the app says
    links.ts            The privacy and support pages
    state/              zustand stores: settings, sound, session, high scores
    rn/                 React Native screens, sheets and controls
    rn/games/<id>/      One screen per game (renders engine state)
app/                    expo-router: tabs (Play, Sounds, Settings), onboarding, game
site/                   inverna.app: privacy, support (make deploy-site)
```

## Platforms

iOS is the product (Inverna Dev, Beta and the App Store app; see
`docs/RELEASES.md`). The web build still compiles because it's a quick way to
look at screens, but nobody uses it; Android is parked.

| Layer | iOS | Web |
|---|---|---|
| Storage | `expo-sqlite/localStorage/install` | localStorage |
| Audio | react-native-audio-api (patched: see `patches/`) | Web Audio API |
| Haptics | expo-haptics | none |
| Rendering | React Native, Skia, react-native-svg | react-native-web, CanvasKit |
| Reminders | expo-notifications (local only) | .ics file |

## Saved data

Everything stored is `unknown` until a check accepts it: settings, high scores
and the wind-down session check each field and keep the default for one that
doesn't fit (`pickValid`), and every game passes its own save check to
`useGameSave(id, fallback, isSave)`. A new settings field needs a check in
`SAVED` (`ui/state/settings.ts`) or it isn't loaded.

## Sound

`ui/state/sound.ts` is the one owner of playback. It keeps one deadline
(`stopAt`: the sleep timer or the end of a wind-down, whichever is first) and
keeps start, edit, interruption and stop apart: an edit never touches the
sleep fade, a call keeps the deadline, and the deadline stops everything from
the audio thread (a silent source that ends with the fade) even when JS is
asleep on a locked phone. Textures are worked out by one background queue.

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
  dependencies at definition time). `ui/rn/worklets.test.ts` enforces it.

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

All data is on the device under the `inverna:` key prefix. Settings → Erase
all data clears it, along with reminders and anything on the lock screen.
There is no server, account or analytics: the App Store label is "Data Not
Collected". `ui/log.ts` records wide events for debugging but has no sink and
is switched off.

## Deploy

- The app: cloud builds through `rnd` on GitHub Actions (`make build-ios-*`,
  `docs/RELEASES.md`). `make check` runs on every pull request (`check.yml`).
- The privacy and support pages: `make deploy-site` (Cloudflare Worker,
  `site/wrangler.jsonc`, inverna.app).
