/**
 * Inverna's voice: the words the app says, in one place.
 *
 * Inverna talks like a calm friend, one idea at a time, in plain words people
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

/** The breath from the island: pull Play down to breathe in, hold, let go. */
export const breath = {
  in: 'Breathe in',
  hold: 'Hold',
  letGo: 'Let go',
  out: 'Breathe out',
  /** Play's invitation, under the island, until they've tried it. */
  invite: 'Pull down to breathe',
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
  peekHint: 'Press and hold to see what it is',
  peekPlay: 'Play',
  peekBest: (best: string) => `Your best ${best}`,
  peekPlays: (n: number) => (n === 1 ? 'Played once' : `Played ${n} times`),
  peekNew: 'Not played yet',
  pickChip: 'Suggested tonight',
  /** Read out on a tile Inverna suggests tonight. */
  pickLabel: 'suggested for tonight',
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
  mute: 'Mute onboarding sounds',
  unmute: 'Play onboarding sounds',
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
  create: 'Create',
  heading: 'Try one of these tonight.',
}

/** The Mix studio: make a sound, hear it, save it. Plain words; the details are in its guides. */
export const studioCopy = {
  titleEdit: 'Composer',
  titleNew: 'New sound',
  startsFrom: (name: string) => `Starts from ${name}. Change anything, then save it as your own.`,
  legend: 'Each line is one sound. Taller is louder; slower waves are lower sounds.',
  silence: 'Silence. Raise a slider to begin.',
  pulseAims: (target: string, hz: string) => `Pulse aims for ${target.toLowerCase()} · ${hz} Hz`,
  rowChords: 'Chords',
  sounds: 'Sounds',
  noiseWords: { brown: 'Low', pink: 'Even', white: 'Bright' } as Record<string, string>,
  chords: 'Soft chords',
  pulse: 'Pulse',
  pulseStrength: 'Strength',
  guide: 'Guide',
  bands: {
    off: { name: 'Off', target: 'No pulse' },
    alpha: { name: 'Relax', target: 'Calm and awake' },
    theta: { name: 'Drift off', target: 'The edge of sleep' },
    delta: { name: 'Deep sleep', target: 'Deep sleep' },
  },
  strengths: {
    subtle: { name: 'Gentle', sub: 'Barely there' },
    deep: { name: 'Strong', sub: 'A clearer beat' },
  },
  play: 'Play',
  pause: 'Pause',
  saveNew: 'Save as new',
  saveChanges: 'Save changes',
  saveAsNew: 'Save as a new sound',
  reset: 'Reset',
  nameTitle: 'Name your sound',
  detailsTitle: 'Details',
  save: 'Save',
  nameLabel: 'Name',
  namePlaceholder: 'Rainy cabin',
  hintLabel: 'A few words',
  hintOptional: 'Optional',
  hintPlaceholder: 'Rain on the roof, low hum',
  iconLabel: 'Icon',
  back: 'Back',
  deleteHold: 'Hold to delete this sound',
  yours: 'Your sound',
  yourMix: 'Your mix',
  editHint: 'Touch and hold to edit',
}

/** One line in a studio guide: what it is, and when to reach for it. */
export interface GuideRow {
  id: string
  name: string
  /** Small print after the name (a symbol, a rate). */
  tag?: string
  use: string
}

export interface GuideSection {
  title?: string
  note?: string
  rows: GuideRow[]
}

export interface StudioGuide {
  title: string
  intro: string
  sections: GuideSection[]
  tip?: string
}

/** The (i) guides in the Mix studio: when to use what, in plain words. */
export const studioGuides: Record<'sounds' | 'chords' | 'pulse', StudioGuide> = {
  sounds: {
    title: 'Which sounds?',
    intro: 'Each slider is one sound. Mix a nature sound with a noise, or use either on its own.',
    sections: [
      {
        title: 'Nature',
        rows: [
          { id: 'rain', name: 'Rain', use: 'Steady and familiar. For a busy mind that wants something gentle to follow.' },
          { id: 'waves', name: 'Waves', use: 'Slow swells to breathe along with. For when you feel tense or restless.' },
          { id: 'fire', name: 'Fire', use: 'Warm and close, with soft crackles. For cold nights and feeling cosy.' },
          { id: 'wind', name: 'Wind', use: 'Soft and airy, with very little going on. For when other sounds feel like too much.' },
        ],
      },
      {
        title: 'Noise',
        note: 'One steady hiss with its weight moved from low to high. It covers the sounds that would wake you.',
        rows: [
          { id: 'brown', name: 'Brown', tag: 'Low', use: 'Deep, like distant thunder. Covers low sounds: traffic, a TV next door, snoring. The calmest for most people.' },
          { id: 'pink', name: 'Pink', tag: 'Even', use: 'Balanced, like steady rain. Covers a bit of everything. Try it if brown feels muffled.' },
          { id: 'white', name: 'White', tag: 'Bright', use: 'Like a fan. Covers sharp sounds: voices, doors, a dog barking. Keep it low; it can feel harsh.' },
        ],
      },
    ],
    tip: 'Start with one noise at about half, then add a nature sound on top.',
  },
  chords: {
    title: 'Soft chords',
    intro: 'Four soft notes held under everything, slowly shifting. Their colour also sets the notes games play, so a game always fits your sound.',
    sections: [
      {
        rows: [
          { id: 'up', name: 'Bring it up', use: 'When silence makes you listen for things, or a little music helps you let go.' },
          { id: 'down', name: 'Bring it down', use: 'When any music keeps you thinking, or you only want noise. All the way down turns it off.' },
        ],
      },
      {
        title: 'Colour',
        rows: [
          { id: 'd-dorian', name: 'Wistful', use: 'Thoughtful and a little bittersweet. For rainy nights.' },
          { id: 'e-min-classical', name: 'Nocturne', use: 'Calm and classical, like piano at night. A safe first choice.' },
          { id: 'f-lydian', name: 'Glow', use: 'Warm and bright, like lamplight. For a cosy, content mood.' },
          { id: 'c-maj9', name: 'Open', use: 'Spacious and simple, with nothing to follow. Clear, like the sea at night.' },
          { id: 'g-min9', name: 'Velvet', use: 'Dark and deep, the lowest notes. For the deepest calm.' },
          { id: 'a-min9', name: 'Air', use: 'Light and floating. For when you want it barely there.' },
        ],
      },
    ],
  },
  pulse: {
    title: 'Pulse',
    intro:
      'A slow rhythm woven into the sound. Studies suggest the brain can fall in step with a steady rhythm, so a slower one may help you settle. ' +
      'The evidence is promising but still modest. With headphones it is a soft beat between your ears; on a speaker, a gentle sway.',
    sections: [
      {
        title: 'Which rhythm',
        rows: [
          { id: 'off', name: 'Off', use: 'Just the sound. For when any pulse distracts you.' },
          { id: 'alpha', name: 'Relax', tag: 'α 8–12 Hz', use: 'Calm but awake. While you wind down: reading, a game, tidying up.' },
          { id: 'theta', name: 'Drift off', tag: 'θ 4–8 Hz', use: 'The edge of sleep. Lying in bed, ready to fall asleep. A good default.' },
          { id: 'delta', name: 'Deep sleep', tag: 'δ 1–4 Hz', use: 'The slowest rhythm. For lying in the dark once you’re ready to sleep, and for sound that plays on through the night.' },
        ],
      },
      {
        title: 'How strong',
        rows: [
          { id: 'subtle', name: 'Gentle', use: 'Barely there. Start here; most people never need more.' },
          { id: 'deep', name: 'Strong', use: 'A clearer beat. Try it with headphones, or if Gentle does nothing for you.' },
        ],
      },
    ],
    tip: 'With Slow down before bed on (in Settings), the pulse slows by itself in the hour before bed.',
  },
}

export type SciencePillarKey = 'attention' | 'sound' | 'light'

export const onboarding = {
  skip: 'Skip',
  back: 'Back',
  mute: 'Mute onboarding sounds',
  unmute: 'Play onboarding sounds',
  continue: 'Continue',
  intro: {
    name: 'Inverna',
    /** The intro has no question; the lens and the name lead. */
    title: '',
    tagline: 'Doomscrolling in bed again?',
    subline: 'Swap the feed for quiet games, soft sounds and warm light that slow down toward bedtime.',
    /** Said up front: generous free start, optional one-time unlock. */
    oneTime: 'Start free. One-time unlock, no subscription.',
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
        body: 'Gentle play gives your mind something easy to hold, so racing thoughts have less room.',
      },
      {
        key: 'sound' as SciencePillarKey,
        title: 'Sound',
        body: 'The sound’s pulse slows as bedtime gets closer, from a lively pace to a slow, sleepy one.',
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
  habits: {
    title: 'What do you usually do on your phone in bed?',
    habits: {
      short_video: 'Scroll Instagram, TikTok or YouTube',
      x_news: 'Read X or the news',
      reading: 'Read a book',
      audio: 'Listen to music or podcasts',
      games: 'Play games',
      other: 'Something else',
    },
    note: 'Pick any. Inverna suggests games that can take their place.',
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
    privacy: 'Privacy policy',
    button: 'All set',
  },
  ready: {
    title: 'Your quiet nights are ready.',
    freeHeading: 'Ready free right now',
    freeSummary: '4 quiet games · 4 sleep sounds · Adaptive night light',
    unlockHeading: 'Or unlock everything forever',
    startFree: 'Start free',
  },
}

/** The sound's sleep timer on Sounds: when the sound fades out. */
export const soundTimer = {
  title: 'Sleep timer',
  chip: 'Sleep timer',
  sub: 'When the sound fades out, gently.',
  fadingAt: (clock: string) => `Fading out at ${clock}`,
  endOfSleep: 'End of my sleep time',
  untilEnd: (clock: string) => `At the end of my sleep time, ${clock}`,
  after: (min: number) => (min === 60 ? 'After 1 hour' : `After ${min} minutes`),
  min: 'min',
  hour: 'hour',
  allNight: 'Keep playing all night',
  allNightShort: 'All night',
  allNightNote: 'No timer',
}

/** The "around, give or take" sleep-time control (onboarding and Settings). */
export const sleepAround = {
  around: 'Around',
  giveOrTake: 'Give or take',
  giveOrTakeLabel: (min: number) => (min === 60 ? '1 hour' : `${min} min`),
  summary: (range: string) => `So usually ${range}`,
}

export const settingsCopy = {
  nameLabel: 'Your name',
  namePlaceholder: 'Your name',
  rangeLabel: 'Asleep between',
  lightLabel: 'Light & colour',
  lightAdaptiveSummary: 'Adaptive',
  lightManualSummary: 'Manual',
  adaptiveLabel: 'Adaptive light & colour',
  adaptiveNote: 'Dims and warms the screen by itself as bedtime gets closer. Normal colours in the day.',
  brightness: 'Brightness',
  warmth: 'Warmth',
  brightnessStage: (b: number) => (b < 0.25 ? 'Dimmest' : b < 0.5 ? 'Low' : b < 0.85 ? 'Soft' : 'Full'),
  warmthStage: (w: number) => (w < 0.15 ? 'Neutral' : w < 0.45 ? 'Soft warm' : w < 0.75 ? 'Candlelight' : 'Ember'),
  rangeLearned: (nights: number) => `Learned from your last ${nights} nights`,
  slowDownLabel: 'Slow down before bed',
  slowDownNote: 'In the hour before bed, sounds grow softer and darker and their pulse slows.',
  reminderLabel: 'Bedtime reminder',
  reminderNote: 'Sends a quiet reminder an hour before bed.',
  reminderDenied: 'Turn on notifications in iPhone Settings.',
  privacy: 'Privacy policy',
  privacyNote: 'What stays on your phone, and what doesn’t',
  support: 'Help and support',
  supportNote: 'Questions, problems, ideas',
  howItWorks: 'How Inverna works',
  howItWorksNote: 'The three-pillar system and science behind it',
  erase: 'Erase all data',
  eraseHold: 'Hold to erase everything',
  unlockTitle: 'Unlock all of Inverna',
  unlockNote: 'All 14 games, 12 sounds, unlimited mixes & manual light',
  unlockedTitle: 'Full Inverna unlocked',
  unlockedNote: 'Thank you for supporting quiet, offline software',
  manualLightLocked: 'Adaptive light is free. Manual brightness & warmth are part of Full Unlock.',
  devPreviewFree: 'Preview free tier',
  devPreviewFreeNote: 'Dev only — test locked games, sounds, custom mix limit & paywall without paying.',
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
  title: 'How Inverna works',
  intro:
    'An active mind rarely settles in plain silence. Inverna coordinates three systems across the hour before bed: cognitive load, neuroacoustics, and circadian light.',
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
        text: 'Studies suggest verbal overthinking and visuospatial tasks compete for the same limited working memory. Gentle spatial puzzles can occupy that bandwidth, similar to cognitive shuffling, leaving less room for anxious loops.',
      },
      {
        label: 'Effect',
        text: 'Takes the effort out of trying to fall asleep: no timers, streaks or failure states pushing you to keep going.',
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
        role: 'Where most busy minds start at bedtime. Inverna meets you here instead of demanding instant stillness.',
      },
      {
        key: 'alpha',
        symbol: 'α',
        name: 'Alpha',
        hz: '8–12 Hz',
        state: 'Relaxed wakefulness, eyes resting, inner chatter loosening.',
        role: 'Inverna’s acoustic descent begins near the Alpha-Theta border (~7.8 Hz).',
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
        text: 'Subtle ~10-second volume swells (~6 breaths/min) match the pace of slow breathing, which studies link to a calmer body.',
      },
      {
        label: 'Harmonic key lock',
        text: 'Every game tap is quantized to your soundscape’s scale (D Dorian, F Lydian, G Minor 9) so nothing sounds out of place.',
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
    title: 'Less blue light after dark',
    spectrum: {
      startNm: '400 nm',
      peakLabel: '460–480 nm melanopsin peak',
      peakBadge: 'Filtered',
      endNm: '700 nm',
      safeBadge: 'Inverna night palette + #000 OLED',
    },
    points: [
      {
        label: 'Mechanism',
        text: 'Retinal ipRGC cells express melanopsin, a photopigment peaking around 460–480 nm (blue-cyan) that signals daytime to your circadian clock and suppresses melatonin.',
      },
      {
        label: 'Effect',
        text: 'True #000000 OLED pixels stay physically off while warm, low-blue surfaces dim gradually toward bedtime, easier on eyes used to the dark.',
      },
    ],
    sources: [
      { label: 'Melanopsin', url: 'https://en.wikipedia.org/wiki/Melanopsin' },
      { label: 'Circadian rhythm', url: 'https://en.wikipedia.org/wiki/Circadian_rhythm' },
    ] satisfies readonly ScienceSource[],
  },
  footnote: 'Built on cognitive, acoustic and circadian research to support a wind-down habit. Inverna can help you relax before bed, but it isn’t a medical device and doesn’t diagnose or treat sleep problems.',
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

/** Contextual Full Unlock sheet & onboarding tier explainer. */
export const paywall = {
  title: 'All of Inverna, yours to keep.',
  titleForGame: (name?: string) => (name ? `Unlock ${name} & every game.` : 'Unlock all 14 quiet games.'),
  titleForSound: (name?: string) => (name ? `Unlock ${name} & every sound.` : 'Unlock all 12 sleep sounds.'),
  titleForCustomSound: 'Save unlimited custom mixes.',
  titleForManualLight: 'Tune brightness & warmth by hand.',
  body: 'One purchase unlocks all of Inverna, forever.',
  bodyForCustomSound: 'Your first saved sound is free. Unlock once to save as many mixes as you like.',
  bodyForManualLight: 'Adaptive night light is always free. Unlock once to fine-tune light by hand.',
  features: {
    games: { title: 'All 14 quiet games', detail: 'Every bedtime puzzle, endless & classic' },
    sounds: { title: '12 sleep sounds & unlimited mixes', detail: 'Every soundscape + save as many mixes as you like' },
    light: { title: 'Manual night light', detail: 'Fine-tune brightness & warmth anytime' },
  },
  pills: {
    offline: 'Plays offline',
    once: 'Pay once',
    noAds: 'No ads',
    private: 'No data collected',
  },
  familySharing: 'Includes Apple Family Sharing',
  devPreviewNote: 'Dev preview — tapping unlock simulates a purchase without charging.',
  cta: (price: string | null) => (price ? `Unlock forever · ${price}` : 'Unlock forever'),
  loadingPrice: 'Loading price…',
  retry: 'Try again',
  notNow: 'Not now',
  startFree: 'Start free',
  restore: 'Restore purchases',
  privacy: 'Privacy policy',
  pending: 'Your purchase is waiting for approval. Inverna unlocks as soon as it’s through.',
  failed: 'The purchase couldn’t be confirmed. If you already paid, tap Restore Purchases.',
  nothingToRestore: 'No earlier purchase found on this Apple Account.',
  unreachable: 'Unable to load pricing from the App Store right now.',
}

/** Now and then, while reminders are off: would they like one? */
export const reminderOffer = {
  title: 'Want a nudge before bed?',
  body: 'Evenings slip away fast. I can send one quiet reminder an hour before your bedtime, so you start winding down in time.',
  detail: 'No sound, one a night. Tap it and I’ll ask how your day was and set up your night.',
  yes: 'Remind me',
  notNow: 'Not now',
  denied: 'Notifications are off for Inverna. You can turn them on in iPhone Settings.',
  openSettings: 'Open Settings',
  done: 'You’ll hear from me an hour before bed.',
}

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
  start: 'Start a new game',
  replay: 'Restart this one',
  keepPlaying: 'Keep playing',
  endless: 'Endless',
  endlessNote: 'No game over. Keep playing as long as you like.',
  classic: 'Classic',
}

/** Pond's end of round and its few words on the water. */
export const pondCopy = {
  /** On the door: the gesture, since nothing else on screen shows it. */
  doorHint: 'Draw a loop around a whole family of matching buds, and the koi paints that stroke of the picture.',
  another: 'Next',
  rest: 'Done',
  restNote: 'You can put the phone down',
  water: 'Pond. Draw a loop around one whole family of matching buds and the koi swims it, drawing that stroke of the picture. A loop with two families or a sleeping bud inside opens nothing',
  mode: 'Mode',
  modePictures: 'Pictures',
  modeEndless: 'Endless',
  openNearest: 'Open the nearest bud',
  painting: (name: string, season: string) => `Tonight's painting, ${name}. ${season}`,
}

/** Kumiko's door hint, crest discovery and quiet sleep-timer handoff. */
export const kumikoCopy = {
  doorHint: 'Tap open hairline threads to turn them and close quiet knots. The weave slows as you get sleepy.',
  boardLabel: 'Kumiko endless joinery weave. Tap any open tile to rotate it and close a loop.',
  handoffTitle: 'Slowing down. Start a sleep timer and put your phone down?',
  handoffWithTimer: (mins: number) => `Your sound fades out in ${mins} min. Put your phone down whenever you’re ready.`,
  sleepTimerPill: (mins: number) => `Sleep timer · ${mins}m`,
  shortMin: (mins: number) => `${mins}m`,
  putPhoneDown: 'Put phone down',
  slowerPace: 'Slower pace',
  keepPlaying: 'Keep playing',
  restNote: 'You can put your phone down',
}

/** The maker's note at the bottom of Settings, in Farzin's own words. */
export const about = {
  credit: 'Made with ❤️ by Farzin',
  title: 'Hi, I’m Farzin',
  lines: [
    'I’m the developer of this app. I made Inverna because my always-on ADHD brain wouldn’t shut down at night. I barely had good sleep, and I woke up tired every morning.',
    'I noticed that playing casual games instead of doomscrolling on social media, and listening to calming music, helped me. So I decided to bring the two together.',
  ],
  signature: 'Farzin',
}
