/**
 * The fourteen Inverna games. Pure data — shared by web and native.
 * Each has a clear nocturnal mood tier so tonight's check-in can curate
 * and morph the Home bento cleanly without streaks or leaderboards.
 */
export type GameId =
  | 'kumiko'
  | 'settle'
  | 'cascade'
  | 'hue'
  | 'thread'
  | 'kindle'
  | 'pond'
  | 'drift'
  | 'nine'
  | 'weave'
  | 'dim'
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
  /**
   * `shared`: the Easy / Medium / Hard on the door, kept in settings (read
   * through `useCalm(id)`). `own`: the game picks its own (Nine, Hue, Rally).
   */
  difficulty: 'shared' | 'own'
  /** How to play, the same three short lines for every game. */
  rules: GameRules
}

export interface GameRules {
  /** What you're trying to do. One sentence. */
  goal: string
  /** How your hands do it. */
  play: string
  /** One thing worth knowing. */
  tip: string
}

export const GAMES: readonly GameMeta[] = [
  {
    id: 'kumiko',
    name: 'Kumiko',
    classic: 'Endless loops',
    line: 'Turn hairline threads to close quiet knots in an endless weave.',
    effect: 'Quiet rhythm',
    mood: 'calm',
    status: 'ready',
    difficulty: 'shared',
    rules: {
      goal: 'Close each hairline pattern into a quiet loop as the tapestry glides upward.',
      play: 'Tap any open tile to turn it. Matched edges warm together; closing a whole knot lights it in brass and scrolls onward.',
      tip: 'Some double-curved tiles close in more than one way. Finding the traditional crest reveals its seal. Nothing is timed, and the weave slows as you get sleepy.',
    },
  },
  {
    id: 'pond',
    name: 'Pond',
    classic: 'Koi pond',
    line: 'Loop the lotus buds to reveal the picture hidden in the pond.',
    effect: 'Quiet planning',
    mood: 'calm',
    status: 'ready',
    difficulty: 'shared',
    rules: {
      goal: 'Reveal the picture hidden in the lotus buds, one stroke at a time.',
      play: 'Draw a loop around one whole family of matching buds and the koi swims it: that stroke of the picture draws itself. A stroke takes one clean loop.',
      tip: 'A loop that holds two families, or a dim sleeping bud, opens nothing, so thread your loop between them. Nothing is timed. Endless brings new patterns and gets harder as you get better.',
    },
  },
  {
    id: 'hue',
    name: 'Hue',
    classic: 'Colour gradient',
    line: 'Swap tiles until every row and column blends smoothly.',
    effect: 'Visual order',
    mood: 'calm',
    status: 'ready',
    difficulty: 'own',
    rules: {
      goal: 'Arrange the colour tiles so every row and column blends smoothly from corner to corner.',
      play: 'Tap two tiles to swap them, or drag one onto another. Tiles with a small diamond dot are locked in place.',
      tip: 'Start near the locked tiles and work inward. Tap Hint to light up one helpful swap.',
    },
  },
  {
    id: 'thread',
    name: 'Thread',
    classic: 'Connect paths',
    line: 'Connect matching shapes without crossing lines.',
    effect: 'Quiet focus',
    mood: 'focus',
    status: 'ready',
    difficulty: 'shared',
    rules: {
      goal: 'Connect every matching pair of shapes with a line and cover every square on the board.',
      play: 'Drag from a shape to its match. Lines cannot cross, so drawing over another line cuts it back.',
      tip: 'Every square must be used. If empty squares remain, take a longer route with one of your lines.',
    },
  },
  {
    id: 'drift',
    name: 'Drift',
    classic: 'Sliding tiles',
    line: 'Slide the numbered tiles back into order.',
    effect: 'Sequential rhythm',
    mood: 'calm',
    status: 'ready',
    difficulty: 'shared',
    rules: {
      goal: 'Put the numbered tiles in order from 1, starting at the top left, with the empty space at the bottom right.',
      play: 'Tap any tile in the same row or column as the empty space to slide it over, or swipe the board.',
      tip: 'A small gold dot marks tiles in the right spot. Solve the top row first, then work down.',
    },
  },
  {
    id: 'nine',
    name: 'Nine',
    classic: 'Sudoku',
    line: 'Fill every row, column, and box from one to nine at your pace.',
    effect: 'Quiet focus',
    mood: 'focus',
    status: 'ready',
    difficulty: 'own',
    rules: {
      goal: 'Fill the grid so every row, column, and 3x3 box holds the numbers 1 to 9 with no repeats.',
      play: 'Tap an empty square, then tap a number below. Turn on Notes to jot down possible numbers inside a square.',
      tip: 'Notes clear themselves as soon as you place a matching number in the same row, column, or box.',
    },
  },
  {
    id: 'weave',
    name: 'Weave',
    classic: 'Nonogram',
    line: 'Use the number clues to uncover a hidden picture.',
    effect: 'Patient deduction',
    mood: 'focus',
    status: 'ready',
    difficulty: 'shared',
    rules: {
      goal: 'Fill the right squares to uncover a hidden picture.',
      play: 'Side numbers show groups of filled squares in order (2 1 means two filled, a gap, then one). Drag to fill, or Mark empties.',
      tip: 'Start with the biggest numbers first, since they leave the fewest choices. Tap Hint if a row feels stuck.',
    },
  },
  {
    id: 'dim',
    name: 'Dim',
    classic: 'Lights out',
    line: 'Flip tiles and their neighbours until the whole board is dark.',
    effect: 'Gentle logic',
    mood: 'calm',
    status: 'ready',
    difficulty: 'shared',
    rules: {
      goal: 'Turn off every lit square until the whole board is dark.',
      play: 'Tap any square to flip its light, along with the squares directly above, below, left, and right of it.',
      tip: 'Tapping a dark square can still help by flipping its lit neighbours. Tap Hint to highlight one helpful move.',
    },
  },
  {
    id: 'lanterns',
    name: 'Lanterns',
    classic: 'Memory pairs',
    line: 'Flip two tiles at a time to find every matching pair.',
    effect: 'Soft recall',
    mood: 'calm',
    status: 'ready',
    difficulty: 'shared',
    rules: {
      goal: 'Find every matching pair of hidden symbols on the board.',
      play: 'Tap two tiles to flip them over. Matching pairs stay open; two different tiles flip back after a moment.',
      tip: 'You do not have to wait for a mismatch to close. Just tap your next tile right away.',
    },
  },
  {
    id: 'settle',
    name: 'Settle',
    classic: 'Falling blocks',
    line: 'Stack falling blocks to clear rows at your own pace.',
    effect: 'Spatial focus',
    mood: 'light',
    status: 'ready',
    difficulty: 'shared',
    rules: {
      goal: 'Stack the falling blocks to make full horizontal rows so they clear away.',
      play: 'Tap the board to rotate, drag sideways to move, swipe down to drop, and swipe up to hold. Or use the buttons.',
      tip: 'In Endless mode, if the stack reaches the top, the bottom four rows clear away so you can keep playing.',
    },
  },
  {
    id: 'kindle',
    name: 'Ember',
    classic: '2048',
    line: 'Slide matching numbers together until you reach 2048.',
    effect: 'Gentle planning',
    mood: 'focus',
    status: 'ready',
    difficulty: 'shared',
    rules: {
      goal: 'Combine matching numbers to build higher tiles and reach 2048.',
      play: 'Swipe up, down, left, or right to slide all tiles at once. Matching tiles that touch merge into double their number.',
      tip: 'Keep your biggest number in one corner. If the board fills up, tap Undo or Make room to clear two small tiles.',
    },
  },
  {
    id: 'cascade',
    name: 'Cascade',
    classic: 'Tile match',
    line: 'Tap groups of matching stones and watch them fall away.',
    effect: 'Tactile release',
    mood: 'light',
    status: 'ready',
    difficulty: 'shared',
    rules: {
      goal: 'Clear groups of matching stones from the board.',
      play: 'Tap any group of two or more touching stones of the same colour to drop them away. Bigger groups score more points.',
      tip: 'Leave one colour alone while you clear others around it, so it gathers into one big group.',
    },
  },
  {
    id: 'chime',
    name: 'Chime',
    classic: 'Brick breaker',
    line: 'Bounce the ball off your paddle to clear each wall of blocks.',
    effect: 'Calm precision',
    mood: 'light',
    status: 'ready',
    difficulty: 'shared',
    rules: {
      goal: 'Bounce the ball off your paddle to break every block in the wall.',
      play: 'Tap to launch the ball, then drag the bar below to move your paddle. Hitting near an edge changes the angle.',
      tip: 'Blocks with a gold border take two hits. If you miss the ball, it simply comes back to your paddle.',
    },
  },
  {
    id: 'rally',
    name: 'Rally',
    classic: 'Table rally',
    line: 'Bounce the ball back and forth at an easy pace.',
    effect: 'Steady rhythm',
    mood: 'light',
    status: 'ready',
    difficulty: 'own',
    rules: {
      goal: 'Keep the ball bouncing back and forth across the court as long as you can.',
      play: 'Drag the bar below the court to move your paddle. Hit the ball near an edge to send it at a sharper angle.',
      tip: 'As bedtime gets closer, the ball slows down and your paddle grows a little wider.',
    },
  },
]

export function gameMeta(id: GameId): GameMeta {
  return GAMES.find((g) => g.id === id)!
}

/** What someone wants from tonight's games. Shown as Unwind, Focus and Playful. */
export type NightIntent = 'melt' | 'focus' | 'light'

/** Play's game order for each intent, best match first. */
export const GAMES_BY_INTENT: Record<NightIntent, readonly GameId[]> = {
  melt: ['kumiko', 'pond', 'hue', 'lanterns', 'drift', 'dim', 'thread', 'weave', 'nine', 'kindle', 'cascade', 'settle', 'chime', 'rally'],
  focus: ['nine', 'kumiko', 'weave', 'thread', 'drift', 'kindle', 'dim', 'hue', 'pond', 'lanterns', 'settle', 'cascade', 'chime', 'rally'],
  light: ['settle', 'kumiko', 'kindle', 'cascade', 'chime', 'rally', 'thread', 'dim', 'drift', 'hue', 'pond', 'nine', 'weave', 'lanterns'],
}
