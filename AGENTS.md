# Lull — agent guide

Lull is a mobile-first PWA: quiet classic games, procedural sleep sounds, and a
low-light night filter built to replace late-night doomscrolling. Offline,
on-device, no accounts, no ads, no streaks, no leaderboards.

Read `docs/ARCHITECTURE.md` and `docs/DESIGN.md` before writing code.

## Commands

```bash
pnpm dev          # http://localhost:5173  (open a game directly: /?game=settle)
pnpm typecheck    # app + strict zero-DOM portability check on src/core
pnpm test         # vitest
pnpm build        # typecheck + production PWA build into dist/
```

## Hard rules

1. **`src/core/**` is pure TypeScript.** No React, no DOM, no `window`,
   `document`, `performance`, `requestAnimationFrame`, `localStorage`,
   `Math.random` (use `createRng` from `src/core/rng.ts`). Must pass
   `tsc -p tsconfig.core.json`.
2. **Engines are deterministic state machines.** Plain serialisable objects
   in, plain objects out. Time comes in as an argument.
3. **Screens are thin.** `src/ui/games/<id>/` renders engine state and maps
   pointer + keyboard input to engine actions.
4. **Use the shared pieces:** `GameShell`, `Completion`, `Button`/`IconButton`/
   `Segmented`/`LightSlider`/`PopoverMenu`/`Sheet`, and hooks in
   `src/ui/hooks/game.ts` + `src/ui/hooks/useTokenColors.ts`.
5. **Low Light tokens only.** Use CSS variables (`var(--p-clay)`,
   `var(--c-surface-2)`, `var(--c-ink)`, …) or `useTokenColors()`. Never add
   blue/cyan/violet, UI gradients, bevels, Y-offset shadows, or `mix-blend-mode`.
6. **Motion rules:** animate `transform`/`opacity` only; `var(--ease-out)` for
   enter/exit; never `scale(0)` (start ≥ 0.9 with opacity 0); never
   `transition: all`; gate hover behind `@media (hover: hover) and (pointer: fine)`;
   respect `prefers-reduced-motion`.
7. **Copy restraint:** No new UI text without removing some. One label per
   control, no hints, no uppercase tracked captions.
8. **Calm is a parameter.** Every engine accepts `calm` (0..1) from `useCalm()`:
   higher calm = slower, simpler, more forgiving.
9. **Persistence:** `useGameSave(id, fallback)` stores one JSON blob per game
   on meaningful moments, never per frame.
10. **Don't touch files outside your assignment.** No git commands that write.
