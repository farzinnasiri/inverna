/**
 * The thirteen Lull games. Pure data — shared by web and native.
 * Each has a clear nocturnal mood tier so tonight's check-in can curate
 * and morph the Home bento cleanly without streaks or leaderboards.
 */
export type GameId =
  | 'settle'
  | 'cascade'
  | 'hue'
  | 'thread'
  | 'kindle'
  | 'pond'
  | 'drift'
  | 'nine'
  | 'weave'
  | 'patience'
  | 'lanterns'
  | 'rally'
  | 'chime'

export type GameStatus = 'ready' | 'soon'
export type GameMood = 'calm' | 'focus' | 'light'

export interface GameMeta {
  id: GameId
  name: string
  /** The classic it is, said plainly. */
  classic: string
  /** One calm line. */
  line: string
  /** What it asks of the mind. */
  effect: string
  /** Mood affinity used by Tonight Check-in to rank and morph tiles. */
  mood: GameMood
  status: GameStatus
}

export const GAMES: readonly GameMeta[] = [
  {
    id: 'pond',
    name: 'Pond',
    classic: 'Ripple blooms',
    line: 'Guide your koi through quiet harmonic water to bloom each lotus constellation.',
    effect: 'Effortless flow',
    mood: 'calm',
    status: 'ready',
  },
  {
    id: 'hue',
    name: 'Hue',
    classic: 'Colour gradient',
    line: 'Swap tiles until the colours flow seamlessly again.',
    effect: 'Visual order',
    mood: 'calm',
    status: 'ready',
  },
  {
    id: 'thread',
    name: 'Thread',
    classic: 'Connect paths',
    line: 'Join each pair of lights without crossing lines.',
    effect: 'Bounded calm',
    mood: 'focus',
    status: 'ready',
  },
  {
    id: 'drift',
    name: 'Drift',
    classic: 'Sliding tiles',
    line: 'Slide the numbered stones home, one quiet move at a time.',
    effect: 'Sequential rhythm',
    mood: 'calm',
    status: 'ready',
  },
  {
    id: 'nine',
    name: 'Nine',
    classic: 'Sudoku',
    line: 'Fill every row, column, and box from one to nine at your pace.',
    effect: 'Quiet focus',
    mood: 'focus',
    status: 'ready',
  },
  {
    id: 'weave',
    name: 'Weave',
    classic: 'Nonogram',
    line: 'Read the clues, weave the cells, reveal the hidden pattern.',
    effect: 'Patient deduction',
    mood: 'focus',
    status: 'ready',
  },
  {
    id: 'patience',
    name: 'Patience',
    classic: 'Solitaire',
    line: 'Build the four suits home from Ace to King.',
    effect: 'Familiar rhythm',
    mood: 'calm',
    status: 'ready',
  },
  {
    id: 'lanterns',
    name: 'Lanterns',
    classic: 'Memory pairs',
    line: 'Turn two lanterns and recall where the matching light rests.',
    effect: 'Soft recall',
    mood: 'calm',
    status: 'ready',
  },
  {
    id: 'settle',
    name: 'Settle',
    classic: 'Falling blocks',
    line: 'Fit the stones and clear rows in calm Endless or Classic mode.',
    effect: 'Visuospatial focus',
    mood: 'light',
    status: 'ready',
  },
  {
    id: 'kindle',
    name: 'Ember',
    classic: '2048',
    line: 'Slide warm embers together until they glow brighter.',
    effect: 'Gentle planning',
    mood: 'focus',
    status: 'ready',
  },
  {
    id: 'cascade',
    name: 'Cascade',
    classic: 'Cluster clear',
    line: 'Tap matching clusters and watch the stones tumble quietly away.',
    effect: 'Tactile release',
    mood: 'light',
    status: 'ready',
  },
  {
    id: 'chime',
    name: 'Chime',
    classic: 'Brick chimes',
    line: 'Guide the brass ball gently to clear resonant stone walls.',
    effect: 'Calm precision',
    mood: 'light',
    status: 'ready',
  },
  {
    id: 'rally',
    name: 'Rally',
    classic: 'Table rally',
    line: 'Return the brass ball up the court at a steady nocturnal rhythm.',
    effect: 'Steady rhythm',
    mood: 'light',
    status: 'ready',
  },
]

export function gameMeta(id: GameId): GameMeta {
  return GAMES.find((g) => g.id === id)!
}
