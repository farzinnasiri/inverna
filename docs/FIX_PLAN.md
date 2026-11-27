# Inverna — Fix Plan

How we work through [AUDIT_REPORT.md](AUDIT_REPORT.md): what comes first, what
waits, and why. The report has the evidence and fix ideas for each `ISS-xx`;
this file only sets the order. Details get decided in the code, step by step.

Written 2026-11-26 against `main` at `f3a1330`.

## Status (27 November 2026)

Phases 0 to 5 are done on `audit-fixes` (draft PR #1), except:

- **Device checks** this plan can't do from a Mac without Xcode: the overnight
  locked-phone test (Phase 1.3), the battery checks (Phase 3), VoiceOver on
  the Pause sheet and the sliders (Phase 2.5), the sheet drag (NAT-06), and
  the Xcode privacy report from a release archive (Phase 2.1).
- **Not done on purpose:** Cascade's falling tiles on shared values and
  Pond's on-screen re-smoothing (Phase 3) wait for a measurement on the
  phone, as the phase says; the web fixes stay parked.

## Scope

- **iOS only.** Android is out for the coming months, so ISS-02 and the
  Android-only parts of other issues (debug-signing fallback, merged manifest,
  notification channel, Android-worded settings text, 16 KB alignment) are
  parked. There is no web app for users either, so the web fixes (ISS-13 and
  the web parts of ISS-16.6 and ISS-19.2) are parked too. The web build keeps
  compiling, because it's a quick way to look at screens.
- **Every other issue in the report is in**, P2 and P3 included. Small
  problems in shared code turn into big ones later.
- **Not in this plan:** the nap and bedtime-range features, and Run Cloud
  simulator builds. Those are separate pieces of work.

## The order, in one line

Safety net → reshape the code where the bugs cluster → fix the bugs on the new
shape → make it cheaper to run → tidy up.

Refactoring first means each bug is fixed once, in the place it belongs,
instead of patched into code we're about to move. Tests come before the
refactors so the refactors can't quietly change behaviour we want to keep.

## Phase 0 — Safety net

Nothing here changes what the app does.

1. **Work on a branch** (`audit-fixes`), one commit per step below, `make check`
   green at every commit. Nothing merges to `main` until the review at the end.
2. **One word for each thing.** A `GLOSSARY.md` at the repo root: the product's
   terms (night, wind-down, check-in, preset, mix, door, round...) with one
   name each and the names to avoid. Phase 1 names its new models from it, and
   code, copy and docs follow it.
3. **CI gate.** A pull-request workflow on Linux that runs `make check` with the
   pinned pnpm version. Add the web typecheck (the `.web` files) to
   `make check` and clear its ~115 errors, so web code is checked like native.
   Fix the shared cause (mostly Lucide `strokeWidth` typing) rather than
   scattering casts.
4. **A few lint rules that catch real bugs:** hooks rules, no `Math.random` /
   `Date.now` in `src/core`, no floating promises in `src/platform` and
   `src/ui/state`. No formatting rules.
5. **Fix the misleading tests** (ISS-22): Pond culprit, Chime mirror, audio
   buffer precompute, worklet regex, Nine solution-count fixtures. Prune the
   brittle ones (copied formulas, inventory counts, TypeScript-type checks) and
   merge the duplicate deal tests.
6. **Pin current behaviour where we're about to refactor:** the sound store and
   transport (start, edit, stop, timer, interruption), reminder scheduling,
   settings hydration and migrations, game-save loading. Where today's behaviour
   is the bug, the test records the correct behaviour and stays skipped until
   Phase 2.
7. **Development builds behave like release for audio.** A `pnpm patch` of
   `react-native-audio-api` so development builds compile it optimised and
   without the per-slice debug check. TestFlight showed the charging noise is a
   development-build problem only (ISS-14), so this replaces the Instruments
   trace the report suggests. The patch carries a note saying why, so it can be
   dropped on a library upgrade. Checked with `pod install` and a Debug and a
   Release compile.
8. **Back to the tested audio setup.** Remove `sampleRate: 24000` from
   `sound.native.ts` (the rename commit brought it back; the clean TestFlight
   build ran without it) and fix that comment. Keep `compensateBufferSampleRate`.

## Phase 1 — Reshape the code where the bugs cluster

Each step is a refactor that makes a group of bugs easy to fix, or makes them
disappear. Ordered so later steps build on earlier ones.

1. **Saved data** (ISS-19.3, part of ISS-16). Everything stored is decoded from
   `unknown` with a validator instead of trusted by a cast. The storage adapter
   moves out of `settings.ts`. Game saves are written outside React state
   updaters. Each game owns its save validator. Everything else saves through
   this, so it goes first.
2. **One idea of "tonight"** (ISS-16). `nightKey` comes from local calendar
   fields, so it's correct across daylight saving. Sleep-learning windows are
   half-open. An expired wind-down is recorded at its deadline, not when the
   phone is next unlocked. "Check-in prompted" is kept separate from "check-in
   answered". All of this is pure `src/core` with tests. Evening, reminders and
   check-in all depend on it.
3. **One owner for playback** (ISS-03, ISS-04, ISS-11, ISS-15). The sound side
   gets one model for what's shown, what's playing, and what's being edited, as
   `StudioTarget` already does for the studio. A session has one absolute
   deadline. Start, edit, interrupt and stop are separate intents, so an edit
   can't undo the sleep fade and an interruption can't outlive the deadline.
   `reset()` covers Erase all data. This is the biggest step, so it lands as
   three commits that are easy to bisect:
   a. the two texture warmers become one cache-aware queue;
   b. the selection, intent and deadline model, plus `reset()`;
   c. the expiry: a silent audio node scheduled to end at the deadline, whose
      `onended` comes from the audio thread even when timers are asleep, guarded
      by a generation token. On expiry the context suspends and the audio
      session is released so iOS lets the app sleep. A native timer only if a
      locked-phone test shows `onended` arriving late.
   It ends with a device build for you to test overnight.
4. **One game lifecycle** (ISS-08, groundwork for ISS-09 and ISS-17). GameShell's
   door, new game, help, pause and nudge become an explicit state machine with a
   known return destination, tested on its own. Mode and difficulty changes are
   staged until you confirm a new game. Each game gives the shell a lazy factory
   and a save validator. The scattered registration points (registry, glyph,
   preview reader, difficulty support, score spec, intent order) become one
   typed game descriptor table, keyed by `GameId` so the compiler rejects a game
   that's missing anywhere. The bedtime-nudge decision moves out into a
   testable function. The engines keep their own shapes.
5. **Reminders with one writer** (ISS-06). Scheduling goes through one
   serialized writer with a generation token, so turning reminders off or
   erasing always wins. Notification ids come from the local date.
6. **Covers and the ambient clock** (ISS-12, ISS-18.1–2). The Goodnight curtain
   counts as a cover and sends an app-wide pause, so games and the backdrop stop
   underneath it. Reduce Motion releases the 30 Hz clock. Onboarding,
   MindTangle and the science sheet animate from `useAmbientTime`.
7. **One way to close a sheet** (ISS-15.2, NAT-06). Dragging a sheet closed runs
   exactly what tapping the backdrop runs. QA found dragging the grabber did
   nothing on device (only the backdrop closed the check-in); fix and check it
   here.

## Phase 2 — Fix the bugs on the new shape

Every fix comes with a test that fails without it.

1. **App Review items:** privacy policy row in Settings and onboarding (ISS-01);
   the copy rewrite (ISS-05); keep the microphone purpose string (App Store
   Connect refuses the upload without it, error 90683); turn off
   remote-notification entitlement; check the privacy report from a release
   archive (ISS-19.4).
   - **Copy:** surgical edits only. Lines that state an effect on the body as
     fact (brain waves, hormones, "stay asleep") say what the app does instead,
     with the research as "studies suggest". Same voice, same rhythm, full
     sentences: no compressed, clipped rewrites. Inverna helps; it never
     promises to fix sleep.
   - **Reminders:** Skip never asks for notification permission (QA saw the
     iOS prompt after Skip twice, landing on top of the check-in: NAT-05). The
     first evening check-in also waits until onboarding's end has settled.
     Reminders
     start off, and the app offers them later with a short sheet that says
     what they're for (at most once every few days, never twice in a night,
     and never again after "Not now" twice).
2. **Privacy and support pages** on `inverna.app` (Cloudflare, in the
   app's own look): `/privacy` and `/support`. Plain and short, nothing about
   how the app works, no link to the code, and a line that Inverna helps but
   promises no result. Contact email to come from Farzin.
3. **Games, worst first.** P1: Cascade, Chime, Settle, Pond, Hue (ISS-09,
   ISS-10, ISS-17). Then P2: Nine, Weave, Rally, Dim, Drift, Lanterns, Thread.
   Then P3: Kindle. This includes difficulty parity, records scoped by board
   size, Pond's loop instruction on the door, and haptics only for things the
   player caused.
4. **Sound leftovers** (ISS-15): resume a custom mix by name, pause when
   headphones disconnect, `playing` only after the context really started,
   retry failed session setup. Plus, from device QA:
   - **NAT-03:** the Sounds pulse chip and the Composer disagree (Lunar tide:
     chip "θ 5.2 Hz", Composer "α Relax · 8.5 Hz"). Outside the hour before
     bed the chip shows the slow-down's resting rate while the sound plays the
     chosen pulse. Both read from one source: the rate actually playing.
   - **NAT-04:** the sound pages open on page 1 while the sound shown is on
     page 2, and the page dot stays wrong after picking. Open on the shown
     sound's page and keep the dot in step.
5. **Accessibility** (ISS-19.1–2, NAT-02): slider accessibility actions and
   keyboard support, the slider sync fix, placeholder contrast, onboarding at
   large text and in iPad Split View. From device QA: the game Pause sheet is
   invisible to VoiceOver (no elements at all); the custom sliders (onboarding,
   Sounds volume) aren't in the accessibility tree; some controls report the
   wrong role (Dim Undo and Lanterns "How to play" as switches, Play tiles and
   Settings toggles as "other").
6. **Look and polish from device QA:**
   - **NAT-01:** onboarding's first page: each card's coloured glow is a hard
     rectangle that runs past the card's rounded edge to the screen edge.
   - **NAT-07:** Dim's hint is too faint on a tile that's already lit; the
     scene's bright moon sits behind text and the pulse chip (onboarding page
     2, Sounds on iPad landscape); Settings scrolls under the status bar and
     its last line crowds the tab bar; Nocturne's subtitle is cut off at
     390pt.

QA screenshots for NAT-xx are in `.qa/` (local only, not in git).

## Phase 3 — Cheaper to run

Only after behaviour is right, and measured, not guessed.

- Cascade falling tiles on shared values; `tickCascade` copies only changed rows.
- Pond caches finished ink.
- Mix faders: one disk write per drag, apply only what changed, no repeated Now
  Playing updates.
- Field shader skips the unused scene; Skia scratch arrays reused.
- Fewer background timers. (Lazy game imports and merging the night-filter
  layers only if profiling shows they matter.)
- With you and the phone: the battery checks from the report's device protocol
  (locked and playing, including 5 minutes after the timer ends).

## Phase 4 — Tidy up

- Remove dead code (`nav.ts` tab/game actions, `PopoverMenu`), the last "Lull"
  strings, and fix the small audio cleanups (cue voice count, motif generation,
  Kindle seed) (ISS-20).
- Bring `ARCHITECTURE.md`, `DESIGN.md` and `AGENTS.md` up to date, including
  the testing standard from the report.
- One place for the web head and service-worker registration.
- Build workflow (ISS-07, iOS parts): no `eval` of dispatch input, pnpm pinned,
  submit a named build rather than "latest".
- Faster cloud builds (a Release simulator build took 35 minutes), in
  `.github/workflows/eas-build.yml`:
  - simulator builds for `arm64` only (`ARCHS=arm64 EXCLUDED_ARCHS=x86_64`):
    the cloud simulators are Apple Silicon, so building x86_64 too doubles
    the native compile;
  - a CocoaPods and build cache keyed on `pnpm-lock.yaml` and `app.config.ts`
    (the current key hashes `ios/Podfile.lock` before `pod install` creates
    it, so it's always empty), plus `ccache` for the C/C++/ObjC++ pods;
  - prebuilt React Native frameworks (`RCT_USE_PREBUILT_RNCORE=1`,
    `RCT_USE_RN_DEP=1`) if RN 0.88 with Expo 58 supports them, checked with a
    build;
  - the pnpm store cached in `actions/setup-node`.
- `expo-blur` and pnpm versions pinned to the SDK matrix.

## Phase 5 — Store features (last, after everything above works)

Each needs logic in the app, not only screens.

1. **Hard paywall, one-time purchase.** After onboarding and before the app
   opens. Without the purchase the app doesn't work: entitlement checked with
   StoreKit on the device (not a flag in saved data), Restore Purchases, and no
   way around it by editing storage. Development builds skip it; Beta uses
   Apple's sandbox. $9.99 for now (to be discussed again), Gemini's Version B
   ("Your evening is set up") with the anchor line from Version C
   ([research/PAYWALL.md](research/PAYWALL.md)). From that research:
   - the price on the button comes from StoreKit (`displayPrice`), never
     typed in, and the screen says "one-time purchase, no subscription";
   - Restore Purchases, Privacy Policy and Terms of Use (Apple's standard
     EULA) are on the paywall itself, before buying;
   - a plain note in the small print: made to help you relax before bed, not
     to diagnose or treat a sleep condition;
   - the "Ready for tonight" list reflects what onboarding actually set up;
   - onboarding says early, in one quiet line, that Inverna is a one-time
     purchase after setup, so the paywall is never a surprise;
   - the scene keeps moving behind the paywall;
   - App Store Connect: the non-consumable product with the regional price
     ladder (about 100% / 75% / 50% / 35–40% of the US price by region),
     Family Sharing on, attached to the first submission, and review notes
     that explain how to test buying and restoring. The first two lines of
     the App Store description say it's a one-time purchase.
2. **Sound in the background** (what "Live Activity" meant in the request):
   already there. Background audio is on, Lock Screen and Control Center
   controls work, and the deadline stops the sound with the phone locked.
   iOS asks no permission for it, so the reminder offer asks only for
   notifications. No Live Activity.
3. **Rating prompt.** Apple's own in-app review sheet, shown rarely and only to
   people who use Inverna regularly, right after something good (a finished
   wind-down or round). Never on a first night, never twice close together.
4. **Logging, with nowhere to send it (yet).** Farzin wants Apple's "Data
   Not Collected" label, so nothing leaves the phone. The code gets one
   wide-event logger: each meaningful moment (a screen, onboarding steps, a
   game round, a wind-down, a caught error, a crash) becomes one structured
   event with its context, through a single `log` module. It has no sink and
   is switched off, so nothing is stored or sent; a sink (PostHog or another)
   can be plugged in later behind a setting and an updated privacy page.
   No analytics switch or onboarding tick until then.

## Research (for Phase 5)

Done: [research/PAYWALL.md](research/PAYWALL.md) (Gemini) and
[research/PRICING.md](research/PRICING.md) (Astra). Price is $9.99 for now;
talk about it again when the plan is done.

## Waiting on Farzin

- Click Cloudflare's verification email at farzinnasiri+inverna@protonmail.com,
  so support@inverna.app can forward there (the rule is created after).

## Done means

All phases committed on `audit-fixes`, `make check` green, one release build
tested on your phone, the reviewer's pass done, and then merged.
