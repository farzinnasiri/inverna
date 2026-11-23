# Lull

Quiet classic games, procedural sleep sounds, and a low-blue night filter — built as an offline-first PWA to replace late-night doomscrolling.

No accounts, no ads, no streaks, no leaderboards. Everything lives on your device.

## Quick start

```bash
pnpm install
pnpm dev          # local dev server (http://localhost:5173)
```

Open any game directly while testing: `http://localhost:5173/?game=settle` (`settle`, `hue`, `thread`, `kindle`, `pond`).

## Scripts

```bash
pnpm typecheck    # full app + strict zero-DOM portability check on src/core
pnpm test         # vitest unit tests (engines + sound + night + session)
pnpm build        # production PWA bundle into dist/
pnpm preview      # serve dist/ locally
pnpm deploy       # build + deploy static assets to Cloudflare Workers (wrangler.jsonc)
```

## What's inside

### 5 playable classic games (+ 5 more on the 10-game shelf)
1. **Settle** — Classic falling blocks (Tetris) that never speeds up and has no game-over screen; when the stack fills, the bottom rows dissolve gently into embers.
2. **Hue** — Classic colour gradient harmony puzzle in perceptual OKLab across 14 warm, low-blue palettes.
3. **Thread** — Classic Connect the Dots across 21 curated puzzles that gradually ease from 7×7 down to 5×5 during wind-down.
4. **Kindle** — Classic 2048 in an Ember heat-stage palette (coal to candlelight) with 12-step undo and gentle `Make room`.
5. **Pond** — Ambient koi pond with an articulated fish, concentric ripples, and glowing lantern-motes.

Planned next on the shelf: **Drift** (15-puzzle), **Nine** (Sudoku), **Weave** (Nonogram), **Patience** (Klondike solitaire), and **Lanterns** (Memory pairs).

### Sleep & evening tools
- **Wind-down sessions** (`10 / 15 / 20 / 30 min`) — progressively warm and dim the screen, soften audio, ease game pacing (`calm: 0 → 1`), and end with a quiet fade to black (no victory screen, no "play again").
- **Procedural sound & binaural engine** — 100% Web Audio synthesis (Rain, Waves, Hearth, Wind, Brown/Pink/White noise + stereo Delta/Theta/Alpha/Gamma binaural rhythms + soft game cues). Zero audio downloads.
- **Night light & bedtime schedule** — manual warmth/dim sliders, automatic pre-bedtime ramp, and `.ics` calendar reminder export.

## Architecture & Expo / React Native migration

See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) and [docs/DESIGN.md](./docs/DESIGN.md). All game rules, RNG, session curves, schedules, and design tokens live in `src/core/` and `src/design/` with zero DOM or React dependencies (enforced by `tsconfig.core.json`), so migrating to Expo / React Native reuses the engines and tokens untouched.
