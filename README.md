# Inverna

Quiet classic games, procedural sleep sounds, and a low-blue night light — built with **Expo + React Native** for **iOS, Android, and Web PWA** to replace late-night doomscrolling.

No backend, no accounts, no ads, no streaks, no leaderboards. Everything lives on your device.

## Quick start

```bash
make install      # pnpm install
make dev          # Run Inverna through Portless (named local URL + LAN Metro for Expo Go)
make start        # Expo Metro directly for Expo Go / iPhone over LAN
make ios          # Launch on iOS Simulator
make android      # Launch on Android Emulator
```

Open any game directly on web: `http://localhost:8081/game/settle` (`settle`, `cascade`, `hue`, `thread`, `kindle`, `pond`, `drift`, `nine`, `weave`, `patience`, `lanterns`, `rally`, `chime`).

## Commands

```bash
make check        # typecheck (app + zero-DOM src/core) + all Vitest suites
make sounds       # regenerate procedural bundled WAV loops & cues in assets/sounds/
make build-web    # export static Expo web bundle + offline PWA service worker into dist/
make deploy       # build-web + deploy static PWA to Cloudflare Workers
make doctor       # run expo-doctor dependency health check
```

## What's inside

### 13 quiet classic games
1. **Settle** — Classic falling blocks (Tetris) with Game Boy split thumb controls; never speeds up, and bottom rows dissolve gently instead of game over.
2. **Cascade** — Tactile cluster-collapse mosaic with 2D rigid-body tumbling tiles.
3. **Hue** — Perceptual OKLab 2D colour gradient puzzle across 14 Watchmaker nocturnal palettes.
4. **Thread** — Connect the Dots across 21 curated puzzles with distinct geometric endpoint shapes.
5. **Kindle** — 2048 in a machined Slate→Brass→Ivory ramp with 12-step undo and gentle `Make room`.
6. **Pond** — Ambient moonlit koi pond with an articulated 10-segment koi, ripples, and lantern motes.
7. **Drift** — 15-puzzle sliding machined plates with multi-tile slide and brass home markers.
8. **Nine** — Classic 9×9 Sudoku with verified unique solutions, pencil notes, and peer pruning.
9. **Weave** — Classic Nonogram / Picross across 20 curated silhouettes with drag-painting.
10. **Patience** — Classic Draw-1 Klondike Solitaire with bespoke Watchmaker cards, `smartMove`, and auto-complete.
11. **Lanterns** — Memory pairs with 12 engraved Watchmaker geometric sigils.
12. **Rally** — Vertical Pong with Easy, Medium, and Hard AI.
13. **Chime** — Classic Breakout / Brick Breaker with 8 architectural formations and cracking brass bricks.

### On-device sleep tools
- **Wind-down sessions** (`10 / 15 / 20 / 30 min`) — progressively warm and dim the screen, soften audio, ease game pacing (`calm: 0 → 1`), and end with a quiet fade to black.
- **Universal audio engine** — live procedural Web Audio API synthesis on Web; multi-layer `expo-audio` playback with bundled procedural WAV loops and lock-screen background playback on iOS/Android.
- **Native device polish** — `expo-haptics` tactile engine on iOS/Android, `expo-notifications` daily on-device bedtime wind-down reminders (with `.ics` fallback on Web), `expo-sqlite` synchronous local persistence, and `expo-keep-awake` during sessions.

## Architecture

All 13 game engines, RNG, session curves, bedtime schedules, sound catalog, and OKLab Watchmaker tokens live in `src/core/` and `src/design/` with **zero DOM and zero React dependencies** (enforced by `tsconfig.core.json`).

## Vision, Naming & Distribution

- [`VISION.md`](VISION.md) — 2027 product vision & Apple Editors' Choice release arc.
- [`DISTRIBUTION.md`](DISTRIBUTION.md) — Positioning thesis, core pillars, pricing/freemium model, complete App Store Connect metadata, screenshot & banner playbook, icon architecture, and marketing copy bank.
- [`GLOSSARY.md`](GLOSSARY.md) — Canonical names for every feature in code, copy, and docs.
- [`docs/store/APP_STORE.md`](docs/store/APP_STORE.md) — App Store Connect submission & review checklist.
