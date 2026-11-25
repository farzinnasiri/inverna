# Lull — agent guide

Lull is an offline-first **Expo SDK 58 + React Native** app (iOS, Android, and Web PWA): 13 quiet classic games, procedural sleep sounds, and a low-blue night light built to replace late-night doomscrolling. Zero backend, no accounts, no ads, no streaks, no leaderboards.

Read `docs/ARCHITECTURE.md`, `docs/DESIGN.md`, and `docs/REDESIGN_V2.md` before making major UI changes.

Three iOS apps install side by side: Lull Dev, Lull Beta (TestFlight) and Lull (App Store), picked by `APP_VARIANT`. See `docs/RELEASES.md` before building, submitting or changing app IDs, icons or build numbers.

## Commands

```bash
make dev          # Run Lull through Portless (named local URL + LAN Metro)
make start        # Expo Metro for Expo Go / phone over LAN
make check        # pnpm typecheck (app + zero-DOM src/core) + pnpm test (vitest)
make build-web    # export static Expo web PWA into dist/
```

## Hard rules

1. **`src/core/**` is pure TypeScript.** No React, no React Native, no DOM, no `window`, `document`, `performance`, `requestAnimationFrame`, `localStorage`, `Math.random` (use `createRng` from `src/core/rng.ts`). Must always pass `tsc --noEmit -p tsconfig.core.json`.
2. **Engines are deterministic state machines.** Plain serialisable objects in, plain objects out. Time comes in as an argument.
3. **Screens are thin universal React Native views.** `src/ui/rn/games/<id>/` renders engine state with React Native primitives + `react-native-svg` + `PanResponder` and maps touch + keyboard (`useKeys` on web) to engine actions. Never use HTML DOM elements (`<div>`, `<canvas>`, `.css`).
4. **Use the shared RN primitives:** `GameShell`, `Completion` (`src/ui/rn/GameShell.tsx`), `Button`/`IconButton`/`Segmented`/`LightSlider`/`PopoverMenu`/`Sheet` (`src/ui/rn/controls.tsx`), hooks in `src/ui/rn/hooks.ts`, and `useTokenColors()` (`src/ui/hooks/useTokenColors.ts`).
5. **Watchmaker Ink & Brass tokens only.** True `#000000` OLED ground, flat surfaces (`surface1`, `surface2`, `surface3`), 1px hairline borders, antique brass accent (`#C2A15F`), zero shadows (`shadow*`, `elevation`), zero UI gradients, zero `mix-blend-mode`.
6. **Calm is a parameter.** Every engine accepts `calm` (0..1) from `useCalm()`: higher calm = slower, simpler, more forgiving.
7. **Persistence:** `useGameSave(id, fallback)` stores one JSON blob per game via sync `kv()` (`expo-sqlite/localStorage/install` on native, `localStorage` on web) on meaningful moments, never per frame.
8. **Don't touch files outside your assignment.** No git commands that write unless asked.
