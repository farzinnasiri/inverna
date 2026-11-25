/**
 * Lull's voice: the words the app says, in one place.
 *
 * Lull talks like a calm friend, one idea at a time, in plain words people
 * actually use ("go to bed", "fall asleep", "relax"). Source of truth for the
 * wording: design/copy/copy.json and design/copy/VOICE.md.
 * The user's name is used sparingly: greetings and reminders, not every line.
 */
import type { DayAnswer, NowAnswer } from '@/core/tonight'

/** "Good evening" or "Good evening, Sam". */
export const named = (line: string, name: string) => (name.trim() ? `${line}, ${name.trim()}` : line)

export function greeting(hour: number, name: string): string {
  const part = hour < 5 ? 'Hello' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  return named(part, name)
}

export const play = {
  windDown: 'Wind down',
  endWindDown: 'End wind down',
  /** Afternoon: one idea, when bed is. */
  bedtimeIs: (bedtime: string) => `Bedtime is at ${bedtime}`,
  tonightBedtimeIs: (bedtime: string) => `Tonight's bedtime is ${bedtime}`,
  minutesUntilBed: (n: number) => (n === 1 ? 'minute until bed' : 'minutes until bed'),
  untilBed: 'until bed',
  pastBig: (name: string) => (name.trim() ? `Still up, ${name.trim()}?` : 'It’s past your bedtime'),
  pastSub: (bedtime: string) => `Your bedtime was ${bedtime}`,
  pastWindDown: 'Wind down now',
  pastChange: 'Change bedtime',
  restBig: (name: string) => named('Rest well', name),
  restSub: 'I’m here if you need a sound',
  morningSub: 'Hope you slept well',
  daytimeBig: (name: string) => (name.trim() ? `Good to see you, ${name.trim()}` : 'See you tonight'),
  noBedtimeBig: 'When do you go to bed?',
  noBedtimeSub: 'Tap to set a bedtime',
}

export const checkIn = {
  intro: (name: string) => (name.trim() ? `Hey ${name.trim()}, how are you feeling tonight?` : 'Before we start, how are you feeling tonight?'),
  skip: 'Skip for tonight',
  back: 'Back',
  dayQuestion: 'How was your day?',
  daySub: 'I’ll pick tonight’s games and sound for you.',
  day: {
    good: { label: 'Good', followUp: 'Glad to hear it.' },
    calm: { label: 'Calm', followUp: 'Nice to end a quiet day quietly.' },
    busy: { label: 'Busy', followUp: 'You can put the rest down now.' },
    stressful: { label: 'Stressful', followUp: 'Today is over. Let’s slow things down.' },
    exhausting: { label: 'Exhausting', followUp: 'You made it through. Almost time to rest.' },
  } satisfies Record<DayAnswer, { label: string; followUp: string }>,
  nowQuestion: 'How do you feel right now?',
  nowSub: 'One more question, then I’ll set things up.',
  now: {
    sleepy: { label: 'Sleepy', followUp: 'I’ll keep things slow and soft.' },
    relaxed: { label: 'Relaxed', followUp: 'I’ll keep this easy pace going.' },
    worn_out: { label: 'Worn out', followUp: 'Nothing demanding tonight.' },
    overthinking: { label: 'Overthinking', followUp: 'I’ll give your mind one quiet thing to hold.' },
    wide_awake: { label: 'Wide awake', followUp: 'No rush to sleep. Let’s ease into it.' },
  } satisfies Record<NowAnswer, { label: string; followUp: string }>,
  gamesReady: 'Tonight’s games are at the top of Play.',
  done: 'Done',
}

export const soundsHelp = {
  link: 'Not sure what fits tonight?',
  heading: 'These two fit tonight',
  sub: 'Based on how you’re feeling. Tap one to listen.',
}

export const onboarding = {
  skip: 'Skip',
  back: 'Back',
  intro: {
    title: 'Hi, I’m Lull',
    body: 'I help you slow down in the hour before bed. Quiet games, soft sounds, and a warmer screen.',
    button: 'Let’s begin',
  },
  bedtime: {
    title: 'When do you usually go to bed?',
    body: 'I’ll start warming the screen an hour before. You can always move it for one night.',
    reminder: 'Remind me before bed',
    reminderNote: 'A quiet note an hour before bedtime.',
    button: 'Continue',
  },
  sound: {
    title: 'What helps you fall asleep?',
    body: 'Tap any sound to listen. You can change it any time.',
    playing: 'Playing',
    button: 'Continue',
  },
  name: {
    title: 'May I know your name?',
    body: 'Just so I can say hello now and then. You can skip this if you prefer.',
    placeholder: 'Your first name',
    note: 'Optional. Stays only on this phone.',
    button: 'All set',
  },
}

export const settingsCopy = {
  nameLabel: 'Your name',
  namePlaceholder: 'Add your first name',
  nameNote: 'Used now and then in greetings and reminders.',
  reminderLabel: 'Bedtime reminder',
  reminderNote: 'Sends a quiet reminder an hour before bed.',
  reminderDenied: 'Turn on notifications in iPhone Settings.',
  replayIntro: 'Replay intro',
}

/** One a night at wind-down time, in rotation. With a name, the `named` title is used. */
export const reminders: readonly { title: string; named: string; body: string }[] = [
  { title: 'Time to slow down', named: 'Time to slow down, {name}', body: 'Bedtime is an hour away. Come check in and tell me how today went.' },
  { title: 'How was your day?', named: 'How was your day, {name}?', body: 'Tell me how you feel and I’ll pick tonight’s games and sound.' },
  { title: 'Almost time for bed', named: 'Almost time for bed, {name}', body: 'One quiet game or a soft sound, whenever you’re ready to wind down.' },
  { title: 'Ready to relax?', named: 'Ready to relax, {name}?', body: 'Drop in for a quick check-in and let the evening slow down.' },
  { title: 'Something quieter is waiting', named: 'Good evening, {name}', body: 'Bedtime is coming up. Come tell me how tonight feels.' },
  { title: 'An hour until bed', named: 'An hour until bed, {name}', body: 'Check in when you’re ready and I’ll set up your night.' },
  { title: 'Winding down soon', named: 'Winding down soon, {name}', body: 'No rush. Your games and sleep sound are here when you want them.' },
]

export const bedtimeNudge = {
  title: (name: string) => named('It’s your bedtime', name),
  body: 'Your game is saved right where you are. Ready to get some sleep?',
  putPhoneDown: 'Put my phone down',
  putPhoneDownNote: 'Your sleep sound keeps playing, then fades out on its own.',
  keepPlaying: 'Keep playing',
  stop: 'Stop for tonight',
}

export const gameDoor = {
  difficulty: 'Difficulty',
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  continue: 'Continue where you left off',
  newGame: 'New game',
  endless: 'Endless',
  endlessNote: 'No game over. Keep playing as long as you like.',
  classic: 'Classic',
}
