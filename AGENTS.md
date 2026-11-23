# Lull — agent guide

Lull is a mobile-first PWA: ten quiet classic games plus sleep sounds and a
night filter, built to replace late-night doomscrolling. Offline, on-device,
no accounts, no ads, no streaks, no leaderboards.

Read `docs/ARCHITECTURE.md` and `docs/DESIGN.md` before writing code.

## Commands

```bash
pnpm dev          # http://localhost:5173  (open a game directly: /?game=settle)
pnpm typecheck    # app + the no-DOM portability check on src/core
pnpm test         # vitest (engine tests live next to engines)
pnpm build        # typecheck + production build into dist/
```

## Hard rules

1. **`src/core/**` is pure TypeScript.** No React, no DOM, no `window`,
   `document`, `performance`, `requestAnimationFrame`, `localStorage`,
   `Math.random` (use `createRng` from `src/core/rng.ts`). It must pass
   `tsc -p tsconfig.core.json`. This folder moves to React Native unchanged.
2. **Engines are deterministic state machines.** Plain serialisable objects
   in, plain objects out (`(state, action) => state`, `tick(state, dtMs)`).
   No classes holding hidden state, no timers inside engines. Time comes in
   as an argument.
3. **Screens are thin.** `src/ui/games/<id>/` renders engine state and maps
   input (pointer gestures + keyboard) to engine actions. All rules live in
   the engine.
4. **Use the shared pieces:** `GameShell`, `Completion` (from
   `src/ui/components/GameShell.tsx`), `Button`/`IconButton`/`Segmented`
   (from `src/ui/components/controls.tsx`), hooks in `src/ui/hooks/game.ts`
   (`useGameLoop`, `useGameSave`, `useCalm`, `useFeedback`, `useGestures`,
   `useKeys`). Sound/haptics only through `useFeedback`.
5. **Design tokens only.** Colours come from CSS variables
   (`var(--p-ember)`, `var(--c-night-2)`, …) or `src/design/tokens.ts`.
   Never introduce blue/cyan/violet. Never hardcode new fonts.
6. **Motion rules:** animate `transform`/`opacity` (and `clip-path`, `filter`
   sparingly) only; ease-out `var(--ease-out)` for enter/exit; never
   `scale(0)` (start ≥ 0.9 with opacity 0); never `transition: all`; hover
   effects inside `@media (hover: hover) and (pointer: fine)`; respect
   `prefers-reduced-motion`.
7. **Calm is a parameter.** Every engine accepts a `calm` value 0..1 from
   `useCalm()`: higher calm = slower, simpler, more forgiving. Never faster.
8. **Persistence:** `useGameSave(id, fallback)` stores one JSON blob per game
   (resume state + best + plays). Save on meaningful moments, never per frame.
   Leaving and coming back must resume where the player left off.
9. **Don't touch files outside your assignment.** Shared files (catalog,
   registry, App, design system) are owned by the coordinator; ask in your
   report instead of editing them.
10. **No git commands that write** (commit, checkout, stash, reset). The
    coordinator commits.
