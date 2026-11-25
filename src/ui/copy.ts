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
  pastSub: (bedtime: string) => `Most nights you’re asleep by ${bedtime}`,
  /** Between the early and late edge of their usual range. */
  rangeBig: (name: string) => named('Good night', name),
  rangeSub: (lateEdge: string) => `Your usual sleep time, until ${lateEdge}`,
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
  skip: 'Skip',
  back: 'Back',
  dayQuestion: 'How was your day?',
  day: {
    good: 'Good',
    calm: 'Calm',
    busy: 'Busy',
    stressful: 'Stressful',
    exhausting: 'Exhausting',
    sad: 'Sad',
  } satisfies Record<DayAnswer, string>,
  nowQuestion: 'How do you feel right now?',
  now: {
    sleepy: 'Sleepy',
    relaxed: 'Relaxed',
    worn_out: 'Worn out',
    overthinking: 'Overthinking',
    wide_awake: 'Wide awake',
    restless: 'Restless',
  } satisfies Record<NowAnswer, string>,
  done: 'Done',
}

export const soundsHelp = {
  link: 'Help me pick a sound',
  heading: 'Try one of these tonight.',
}

export type SciencePillarKey = 'attention' | 'sound' | 'light'

export const onboarding = {
  skip: 'Skip',
  back: 'Back',
  continue: 'Continue',
  intro: {
    name: 'Lull',
    title: 'For minds that don’t switch off.',
    subline: 'A quieter way out of late-night scrolling, when silence feels too loud.',
    button: 'See how it works',
  },
  science: {
    title: 'Three quiet signals, working together.',
    curveStart: 'Alert',
    curveEnd: 'Ready for rest',
    bands: ['Beta', 'Alpha', 'Theta', 'Delta'] as readonly string[],
    pillars: [
      {
        key: 'attention' as SciencePillarKey,
        title: 'Attention',
        body: 'Gentle play holds your focus so racing thoughts can’t take over.',
      },
      {
        key: 'sound' as SciencePillarKey,
        title: 'Sound',
        body: 'Adaptive audio slows your pace from alert beta toward calm alpha and theta.',
      },
      {
        key: 'light' as SciencePillarKey,
        title: 'Light',
        body: 'Warm, low-blue colours fade with the hour to signal night.',
      },
    ],
    more: 'Read the science',
    button: 'Get started',
  },
  bedtime: {
    title: 'Most nights, when do you fall asleep?',
    reminder: 'Remind me an hour before bed',
  },
  keeps: {
    title: 'What makes it harder for you to fall asleep?',
    factors: {
      mind_on: 'My mind won’t switch off',
      tired_wired: 'Tired but wired',
      lose_time: 'I lose track of time at night',
      restless: 'My body feels restless',
      me_time: 'Night is my only time for me',
      stress: 'Stress or worry',
      noise: 'Noise around me',
      waking: 'Waking up at night',
    },
    private: 'This stays on your phone.',
  },
  mind: {
    title: 'How busy is your mind at bedtime?',
    label: 'Your mind at bedtime',
    stages: ['Quiet', 'A little busy', 'Busy', 'Very busy'],
  },
  games: {
    title: 'Which of these helps you switch off?',
    styles: {
      soothing: { title: 'Something slow and soothing', games: 'Pond, Hue, Lanterns' },
      puzzle: { title: 'A puzzle I can get lost in', games: 'Nine, Weave, Thread' },
      quick: { title: 'Something quick and light', games: 'Settle, Chime, Cascade' },
    },
  },
  listen: {
    title: 'Which of these sounds do you like?',
    samples: { steady: 'Rain', music: 'Piano', nature: 'Ocean' },
    volume: 'Volume',
  },
  name: {
    title: 'What should I call you?',
    placeholder: 'First name',
    note: 'Optional. It stays on this phone.',
    button: 'All set',
  },
}

export const settingsCopy = {
  nameLabel: 'Your name',
  namePlaceholder: 'Add your first name',
  rangeLabel: 'Asleep between',
  rangeNote: 'Set when your hour starts. Lull learns it from your nights.',
  rangeLearned: (nights: number) => `Learned from your last ${nights} nights`,
  reminderLabel: 'Bedtime reminder',
  reminderNote: 'Sends a quiet reminder an hour before bed.',
  reminderDenied: 'Turn on notifications in iPhone Settings.',
  howItWorks: 'How Lull works',
  howItWorksNote: 'The three-pillar system and science behind it',
  erase: 'Erase all data',
  eraseHold: 'Hold to erase everything',
}

export type WaveBandKey = 'beta' | 'alpha' | 'theta' | 'delta'

export interface ScienceSource {
  label: string
  url: string
}

export interface WaveBandInfo {
  key: WaveBandKey
  symbol: string
  name: string
  hz: string
  state: string
  role: string
}

export const scienceSheet = {
  title: 'How Lull works',
  intro:
    'An active mind rarely settles in plain silence. Lull coordinates three systems across the hour before bed: cognitive load, neuroacoustics, and circadian light.',
  attention: {
    key: 'attention' as SciencePillarKey,
    kicker: 'Pillar 1 · Cognitive psychology',
    title: 'Working memory over empty silence',
    compare: {
      emptyLabel: 'Empty silence',
      emptyTag: 'Rumination loop',
      playLabel: 'Quiet play',
      playTag: 'Visuospatial groove',
    },
    points: [
      {
        label: 'Mechanism',
        text: 'Verbal overthinking and visuospatial tasks compete for the same limited working memory. Gentle spatial puzzles occupy that bandwidth, similar to cognitive shuffling, leaving less room for anxious loops.',
      },
      {
        label: 'Effect',
        text: 'Breaks the sleep-effort paradox without timers, streaks, or failure states that trigger cortisol or dopamine spikes.',
      },
    ],
    sources: [
      { label: 'Working memory', url: 'https://en.wikipedia.org/wiki/Working_memory' },
      { label: 'Rumination', url: 'https://en.wikipedia.org/wiki/Rumination_(psychology)' },
      { label: 'Cognitive shuffle', url: 'https://en.wikipedia.org/wiki/Cognitive_shuffle' },
    ] satisfies readonly ScienceSource[],
  },
  sound: {
    key: 'sound' as SciencePillarKey,
    kicker: 'Pillar 2 · Neuroacoustics',
    title: 'Brainwave bands & acoustic descent',
    lead: 'Neural oscillations shift from fast, irregular ripples when you are alert toward slow, synchronized swells as you drift off. Tap a band to inspect its rhythm.',
    bands: [
      {
        key: 'beta',
        symbol: 'β',
        name: 'Beta',
        hz: '13–30 Hz',
        state: 'Active thinking, problem-solving, late-night racing thoughts.',
        role: 'Where most busy minds start at bedtime. Lull meets you here instead of demanding instant stillness.',
      },
      {
        key: 'alpha',
        symbol: 'α',
        name: 'Alpha',
        hz: '8–12 Hz',
        state: 'Relaxed wakefulness, eyes resting, inner chatter loosening.',
        role: 'Lull’s acoustic descent begins near the Alpha-Theta border (~7.8 Hz) to ease mental grip.',
      },
      {
        key: 'theta',
        symbol: 'θ',
        name: 'Theta',
        hz: '4–8 Hz',
        state: 'Twilight drift, imagery loosening, pre-sleep hypnagogia.',
        role: 'Mid-session modulation settles around ~5 Hz while high frequencies gently melt away.',
      },
      {
        key: 'delta',
        symbol: 'δ',
        name: 'Delta',
        hz: '0.5–4 Hz',
        state: 'Deep, restorative slow-wave sleep.',
        role: 'Near bedtime, modulation slows toward ~2.4 Hz before fading out on its own.',
      },
    ] satisfies readonly WaveBandInfo[],
    points: [
      {
        label: '1/f Pink & brown noise',
        text: 'Energy rolls off at higher frequencies, masking sudden room sounds without harsh hiss.',
      },
      {
        label: '0.1 Hz breath pacing',
        text: 'Subtle ~10-second volume swells (~6 breaths/min) mirror cardiorespiratory resonance to encourage parasympathetic calm.',
      },
      {
        label: 'Harmonic key lock',
        text: 'Every game tap is quantized to your soundscape’s scale (D Dorian, F Lydian, G Minor 9) so nothing jars the auditory cortex.',
      },
    ],
    sources: [
      { label: 'Neural oscillation', url: 'https://en.wikipedia.org/wiki/Neural_oscillation' },
      { label: 'Colors of noise', url: 'https://en.wikipedia.org/wiki/Colors_of_noise' },
      { label: 'Music therapy', url: 'https://en.wikipedia.org/wiki/Music_therapy' },
    ] satisfies readonly ScienceSource[],
  },
  light: {
    key: 'light' as SciencePillarKey,
    kicker: 'Pillar 3 · Circadian optics',
    title: 'Protecting melatonin after dark',
    spectrum: {
      startNm: '400 nm',
      peakLabel: '460–480 nm melanopsin peak',
      peakBadge: 'Filtered',
      endNm: '700 nm',
      safeBadge: 'Lull night palette + #000 OLED',
    },
    points: [
      {
        label: 'Mechanism',
        text: 'Retinal ipRGC cells express melanopsin, a photopigment peaking around 460–480 nm (blue-cyan) that signals daytime to your circadian clock and suppresses melatonin.',
      },
      {
        label: 'Effect',
        text: 'True #000000 OLED pixels stay physically off while warm, low-blue surfaces dim gradually toward bedtime so dark-adapted eyes stay calm.',
      },
    ],
    sources: [
      { label: 'Melanopsin', url: 'https://en.wikipedia.org/wiki/Melanopsin' },
      { label: 'Circadian rhythm', url: 'https://en.wikipedia.org/wiki/Circadian_rhythm' },
    ] satisfies readonly ScienceSource[],
  },
  footnote: 'Grounded in cognitive, acoustic, and circadian research to support wind-down habits. Not a medical device.',
  close: 'Got it',
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

/** The maker's note at the bottom of Settings, in Farzin's own words. */
export const about = {
  credit: 'Made with ❤️ by Farzin',
  title: 'Hi, I’m Farzin',
  lines: [
    'I’m the developer of this app. I made Lull because my always-on ADHD brain wouldn’t shut down at night. I barely had good sleep, and I woke up tired every morning.',
    'I noticed that playing casual games instead of doomscrolling on social media, and listening to calming music, helped me. So I decided to bring the two together.',
  ],
  signature: 'Farzin',
}
