# Glossary

One name for each thing in Inverna. Use these words in code, copy, docs,
commits and conversation. When the word people see differs from the name in
code, both are listed; don't invent a third. New code takes its names from
here, and a new idea gets a row here first.

## The night

| Term | What it is | In code | Don't say |
|---|---|---|---|
| **Night** | One evening-to-morning, from noon to 06:00 the next day. Everything "tonight" belongs to one night. | `nightKey()` (`src/core/night.ts`) | day, date (for this) |
| **Bedtime** | The time they usually go to bed: the early edge of their sleep range. | `schedule.bedtime` | lights out, sleep time |
| **Sleep range** | Bedtime plus "give or take": when they're usually asleep. Learned from their nights. | `schedule.rangeMinutes`, `src/core/sleepRange.ts` | window (that's the wind-down window) |
| **Tonight's bedtime** | A bedtime changed for one night only, by tapping the time on Play. | `tonightBedtime` | override (in copy) |
| **Evening** | The hour before bedtime, when Play turns to winding down. | `evening` (`src/core/night.ts`) | pre-bed |
| **Wind-down** | A timed session they start from Play: the screen warms and dims, the sound slows, and it ends at bedtime. "Wind down" (two words) is the verb and the button. | `Session`, `src/core/session.ts` | session (in copy), routine |
| **Goodnight** | The curtain at the end of a wind-down. | `SessionCurtain` | end screen |
| **Check-in** | Two questions in the evening ("How was your day?", "How do you feel right now?") that decide tonight's games and sound. | `NightCheckIn`, `src/core/tonight.ts` | survey, quiz |
| **Tonight's pick** | A game or sound suggested for tonight from the check-in or what they like. Shown with a warm tint. | `picks`, `playLayout` | recommendation |
| **Reminder** | The notification an hour before bedtime. | `src/ui/rn/reminders.ts` | alert, push |
| **Bedtime nudge** | The in-game prompt at bedtime ("It's your bedtime"). | `bedtimeNudge` | reminder (that's the notification) |

## Games

| Term | What it is | In code | Don't say |
|---|---|---|---|
| **Game** | One of the 13 games. | `GameId`, `src/core/games/catalog.ts` | level, activity |
| **Door** | The screen before a game starts: continue, new game, difficulty, mode. | `gameDoor`, `GameShell` | lobby, menu |
| **Round** | One play of a game, from start to its end. | engine state | match, run |
| **Mode** | A game's way of playing (Classic, Endless, Pictures). | per engine | variant |
| **Difficulty** | Easy, Medium, Hard. | `Difficulty` | level |
| **Calm** | 0..1: how forgiving and slow a game is, from difficulty and the wind-down. | `useCalm()`, engine `calm` | ease |

## Sound

| Term | What it is | In code | Don't say |
|---|---|---|---|
| **Sound** | Anything that plays on Sounds: a preset, their own sound, or Your mix. | — | track, soundscape (in copy) |
| **Preset** | One of the 12 sounds Inverna ships with. | `Preset`, `PRESETS` | template, built-in |
| **Your sound** | A sound they made and saved with a name and icon. | `CustomSound`, `customSounds` | custom preset, my mix |
| **Your mix** | Changes made in the Composer that aren't saved yet. | `settings.mix`, id `'custom'` | draft (in copy) |
| **Composer** | The sheet where a sound is made and changed. | `MixSheet`, `StudioTarget` | studio, mixer (in copy) |
| **Layer** | One sound in a mix with its own fader: rain, waves, fire, wind, brown, pink, white noise. | `LayerId`, `mix.layers` | channel, track |
| **Soft chords** | The four held notes under a sound. **Chord colour** is their mood (Wistful, Nocturne, ...). | `padGain`, `harmonicKey` | pad, key (in copy) |
| **Pulse** | The slow rhythm woven into a sound: Off, Relax (α), Drift off (θ), Deep sleep (δ). **Strength** is Gentle or Strong. | `band`, `bandGain`, `modulationDepth` | binaural beats, brainwaves (in copy) |
| **Slow down before bed** | The pulse and sound slowing across the hour before bedtime. | `autoDescent`, `descent` (`src/core/sound/arc.ts`) | descent (in copy) |
| **Sleep timer** | When the sound fades out. | `sleepTimer` | timer alone |
| **Orb** | The glass sphere on Sounds that plays and shows the sound. | `SoundField` | dial |
| **Ribbon** | The strands of light on Play that move with the sound. | `SoundRibbon` | waveform |

## Screen and look

| Term | What it is | In code | Don't say |
|---|---|---|---|
| **Night light** | Warmth and brightness of the whole screen; **Adaptive** follows bedtime. | `NightFilterOverlay`, `warmth`, `brightness` | filter (in copy) |
| **Scene** | The living picture behind the tabs, one per preset; a mix weaves several. | `BackdropId`, `src/ui/rn/backdrop/` | wallpaper, background animation |
| **Sheet** | Anything that slides up from the bottom. | `Sheet` | modal, popup |
| **Guide** | The second sheet that explains a Composer section. | `GuideSheet` | info, help |
| **Tinted glass** | How something selected, suggested or primary looks. | `GLASS_TINT` | highlight, outline |
| **Ambient clock** | The one 30 fps timer every moving picture steps on. | `useAmbientTime` | frame loop |
| **Cover** | A sheet or curtain over the screen; moving pictures behind it rest. | `useCovered` | overlay |

## The apps

| Term | What it is |
|---|---|
| **Inverna** | The App Store app (`com.oooflabs.inverna`). |
| **Inverna Beta** | The TestFlight app (`com.oooflabs.inverna.beta`). |
| **Inverna Dev** | The development build that loads code from Metro (`com.oooflabs.inverna.dev`). |
