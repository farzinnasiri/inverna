# Inverna Voice Guide

## Who Inverna is
Inverna is a quiet, steady companion for the hour before sleep. It speaks in first person ("I", "you") when welcoming you, checking in, or reminding you about bed, so nothing feels like it came out of nowhere.

Inverna is warm without being sentimental, clear without sounding clinical, and brief because you are reading it on a phone at night. It never scolds, guilt-trips, or cheers like a fitness app.

## Core principles
- **One idea per spot.** Never pack two facts together with a middot. Say one clear thing and let the screen breathe.
- **Plain, everyday English.** Write so a tired person, or a non-native speaker, gets it on the first read.
- **Real answers.** Buttons and check-in options should sound like something a real person would actually say ("Worn out", "Wide awake", "Put my phone down"), not abstract labels.
- **Teach beginners simply.** Game rules should explain how to play to someone who has never seen the classic, in short concrete sentences.
- **Quiet punctuation.** Use simple periods and question marks. No em dashes. No exclamation marks. No emoji spam.

## Words we avoid and what we use instead

| Avoid | Use instead | Why |
| --- | --- | --- |
| turn in | go to bed, fall asleep | Forced, dated phrasing |
| settle (as a verb) | relax, slow down, rest | Assumed jargon ("Settle" stays as the game name only) |
| lights out | bedtime, sleep, go to bed, all dark | Compressed, militaristic |
| first light | morning, wake up, get up | Overly poetic |
| wind down 60m before bed | warm screen before bed, an hour before bedtime | Compressed shorthand ("Wind down" is fine as a button label) |
| melt away, quiet the static | slow down, relax, clear your head | Therapy or wellness cliches |
| Heavy / Restless / Steady / Bright | Good / Calm / Busy / Stressful / Exhausting | Nobody describes their day as "bright" or "steady" |
| bedtime descent, iso-descent | slowing down for bed, bedtime slow-down | Technical jargon |
| game cues, modulation, broadband mask | game sounds, pulse, soft static | Audio-engineer jargon |
| flagship, curated, seamless, sanctuary | popular, chosen for tonight, smooth, quiet | Marketing language |
| onboarding, clear data | intro, setup, reset app | Developer language |

## Using the user's first name
Asking for a name is optional. When the user shares it, treat it like a real person would: use it rarely so it stays warm and never feels automated.

**Use `{name}` sparingly in:**
- Greeting moments on the Play screen (evening, morning, past bedtime).
- Occasional wind-down and past-bedtime notifications.
- The nightly check-in intro when it opens automatically.
- The inside-game bedtime nudge.

**Never use `{name}` in:**
- Settings, sliders, timers, or game rules.
- Every consecutive screen in a flow (pick one spot per visit).
- Error states or destructive confirmations.

Always ship a natural version without `{name}` that reads just as warmly when no name is saved.
