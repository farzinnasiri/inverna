/**
 * The ten games. Pure data — shared by web and (later) native.
 * Each is one classic, played straight: no variants, no speed-runs,
 * no streaks, no leaderboards.
 */
export type GameId =
  | 'settle'
  | 'hue'
  | 'thread'
  | 'kindle'
  | 'pond'
  | 'drift'
  | 'nine'
  | 'weave'
  | 'patience'
  | 'lanterns'

export type GameStatus = 'ready' | 'soon'

export interface GameMeta {
  id: GameId
  name: string
  /** The classic it is, said plainly. */
  classic: string
  /** One calm line. */
  line: string
  /** What it asks of the mind. */
  effect: string
  status: GameStatus
}

export const GAMES: readonly GameMeta[] = [
  {
    id: 'settle',
    name: 'Settle',
    classic: 'Falling blocks',
    line: 'Fit the pieces, clear the rows. The pace never climbs.',
    effect: 'Visuospatial focus',
    status: 'ready',
  },
  {
    id: 'hue',
    name: 'Hue',
    classic: 'Colour gradient',
    line: 'Swap tiles until the colours flow again.',
    effect: 'Visual order',
    status: 'ready',
  },
  {
    id: 'thread',
    name: 'Thread',
    classic: 'Connect the dots',
    line: 'Join each pair of lights. Paths never cross.',
    effect: 'Bounded problem-solving',
    status: 'ready',
  },
  {
    id: 'kindle',
    name: 'Kindle',
    classic: '2048',
    line: 'Slide embers together until they glow brighter.',
    effect: 'Gentle planning',
    status: 'ready',
  },
  {
    id: 'pond',
    name: 'Pond',
    classic: 'Ambient koi',
    line: 'Guide a fish through dark water. Gather the light.',
    effect: 'Effortless attention',
    status: 'ready',
  },
  {
    id: 'drift',
    name: 'Drift',
    classic: 'Sliding tiles',
    line: 'Slide the tiles home, one quiet move at a time.',
    effect: 'Sequential thinking',
    status: 'ready',
  },
  {
    id: 'nine',
    name: 'Nine',
    classic: 'Sudoku',
    line: 'Every row, column and box holds one to nine.',
    effect: 'Logical calm',
    status: 'ready',
  },
  {
    id: 'weave',
    name: 'Weave',
    classic: 'Nonogram',
    line: 'Read the numbers, fill the cells, reveal the picture.',
    effect: 'Patient deduction',
    status: 'ready',
  },
  {
    id: 'patience',
    name: 'Patience',
    classic: 'Klondike solitaire',
    line: 'The old card game. Build the four suits home.',
    effect: 'Familiar rhythm',
    status: 'ready',
  },
  {
    id: 'lanterns',
    name: 'Lanterns',
    classic: 'Memory pairs',
    line: 'Turn two lanterns. Remember where the light was.',
    effect: 'Soft recall',
    status: 'ready',
  },
]

export function gameMeta(id: GameId): GameMeta {
  return GAMES.find((g) => g.id === id)!
}
