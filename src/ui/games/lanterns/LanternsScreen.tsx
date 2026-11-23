import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  createLanterns,
  flipCard,
  nextPuzzle,
  resolveMismatch,
  sigilLabel,
  type LanternCard,
  type LanternsState,
} from '@/core/games/lanterns/engine'
import { Completion, GameShell, type GameScreenProps } from '@/ui/components/GameShell'
import { useCalm, useFeedback, useGameSave, useKeys } from '@/ui/hooks/game'
import { CardBackMark, SigilMark } from './sigils'
import './lanterns.css'

interface LanternsSave {
  version: 1
  state: LanternsState
  completed: number
}

const MISMATCH_DELAY_MS = 850
const COMPLETION_DELAY_MS = 520

function isValidCard(v: unknown): v is LanternCard {
  if (!v || typeof v !== 'object') return false
  const c = v as Partial<LanternCard>
  return (
    typeof c.id === 'number' &&
    typeof c.sigil === 'string' &&
    typeof c.tone === 'string' &&
    typeof c.flipped === 'boolean' &&
    typeof c.matched === 'boolean'
  )
}

function isValidSave(v: unknown): v is LanternsSave {
  if (!v || typeof v !== 'object') return false
  const s = v as Partial<LanternsSave>
  if (s.version !== 1 || typeof s.completed !== 'number' || !s.state) return false
  const st = s.state
  return (
    st.cols === 4 &&
    (st.rows === 3 || st.rows === 4) &&
    Array.isArray(st.cards) &&
    st.cards.length === st.cols * st.rows &&
    st.cards.every(isValidCard) &&
    typeof st.moves === 'number' &&
    typeof st.matchedPairs === 'number' &&
    (st.totalPairs === 6 || st.totalPairs === 8) &&
    typeof st.puzzleNumber === 'number' &&
    typeof st.solved === 'boolean' &&
    typeof st.rngState === 'number'
  )
}

export default function LanternsScreen({ onExit }: GameScreenProps) {
  const calm = useCalm()
  const { cue, haptic } = useFeedback()

  const [fallback] = useState<LanternsSave>(() => ({
    version: 1,
    state: createLanterns({ seed: Date.now() >>> 0, calm }),
    completed: 0,
  }))
  const [rawSave, setSave] = useGameSave<LanternsSave>('lanterns', fallback)
  const save = isValidSave(rawSave) ? rawSave : fallback
  const state = save.state

  const [paused, setPaused] = useState(false)
  const [showCompletion, setShowCompletion] = useState(state.solved)
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null)

  const stateRef = useRef(state)
  stateRef.current = state
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const calmRef = useRef(calm)
  calmRef.current = calm

  const mismatchTimerRef = useRef<number | undefined>(undefined)
  const completionTimerRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    return () => {
      window.clearTimeout(mismatchTimerRef.current)
      window.clearTimeout(completionTimerRef.current)
    }
  }, [])

  // Auto-close a revealed mismatch after ~850ms (cancelled immediately if player taps a 3rd card).
  useEffect(() => {
    window.clearTimeout(mismatchTimerRef.current)
    if (!state.mismatchPair || paused) return

    mismatchTimerRef.current = window.setTimeout(() => {
      const prev = stateRef.current
      const resolved = resolveMismatch(prev)
      if (resolved === prev) return
      stateRef.current = resolved
      setSave((cur) => {
        const valid = isValidSave(cur) ? cur : fallback
        return {
          version: 1,
          state: resolved,
          completed: valid.completed,
        }
      })
    }, MISMATCH_DELAY_MS)

    return () => window.clearTimeout(mismatchTimerRef.current)
  }, [state.mismatchPair, paused, setSave, fallback])

  const handleFlip = useCallback(
    (index: number) => {
      if (pausedRef.current) return
      const prev = stateRef.current
      const next = flipCard(prev, index)
      if (next === prev) return

      window.clearTimeout(mismatchTimerRef.current)
      stateRef.current = next
      setSave((cur) => {
        const valid = isValidSave(cur) ? cur : fallback
        return {
          version: 1,
          state: next,
          completed: next.solved && !prev.solved ? valid.completed + 1 : valid.completed,
        }
      })

      if (next.solved) {
        cue('chime', 0.95)
        haptic('success')
        window.clearTimeout(completionTimerRef.current)
        completionTimerRef.current = window.setTimeout(() => {
          setShowCompletion(true)
        }, COMPLETION_DELAY_MS)
      } else if (next.matchedPairs > prev.matchedPairs) {
        cue('clear', 0.85)
        haptic('medium')
      } else if (next.mismatchPair !== null) {
        cue('place', 0.5)
        haptic('light')
      } else {
        cue('tap', 0.55)
        haptic('light')
      }
    },
    [cue, haptic, setSave, fallback],
  )

  const handleRestart = useCallback(() => {
    window.clearTimeout(mismatchTimerRef.current)
    window.clearTimeout(completionTimerRef.current)
    setShowCompletion(false)
    setFocusedIndex(null)
    const fresh = createLanterns({
      seed: Date.now() >>> 0,
      calm: calmRef.current,
      puzzleNumber: stateRef.current.puzzleNumber,
    })
    stateRef.current = fresh
    setSave((cur) => {
      const valid = isValidSave(cur) ? cur : fallback
      return {
        version: 1,
        state: fresh,
        completed: valid.completed,
      }
    })
    cue('tap', 0.55)
  }, [cue, setSave, fallback])

  const handleNext = useCallback(() => {
    window.clearTimeout(mismatchTimerRef.current)
    window.clearTimeout(completionTimerRef.current)
    setShowCompletion(false)
    setFocusedIndex(null)
    const next = nextPuzzle(stateRef.current, calmRef.current)
    stateRef.current = next
    setSave((cur) => {
      const valid = isValidSave(cur) ? cur : fallback
      return {
        version: 1,
        state: next,
        completed: valid.completed,
      }
    })
    cue('tap', 0.55)
    haptic('light')
  }, [cue, haptic, setSave, fallback])

  const moveFocus = useCallback(
    (dCol: number, dRow: number) => {
      setFocusedIndex((prev) => {
        const cur = stateRef.current
        if (prev === null) {
          const firstOpen = cur.cards.findIndex((c) => !c.matched)
          return firstOpen >= 0 ? firstOpen : 0
        }
        const col = Math.min(cur.cols - 1, Math.max(0, (prev % cur.cols) + dCol))
        const row = Math.min(cur.rows - 1, Math.max(0, Math.floor(prev / cur.cols) + dRow))
        return row * cur.cols + col
      })
    },
    [],
  )

  useKeys(
    {
      ArrowLeft: () => moveFocus(-1, 0),
      a: () => moveFocus(-1, 0),
      A: () => moveFocus(-1, 0),
      ArrowRight: () => moveFocus(1, 0),
      d: () => moveFocus(1, 0),
      D: () => moveFocus(1, 0),
      ArrowUp: () => moveFocus(0, -1),
      w: () => moveFocus(0, -1),
      W: () => moveFocus(0, -1),
      ArrowDown: () => moveFocus(0, 1),
      s: () => moveFocus(0, 1),
      S: () => moveFocus(0, 1),
      Enter: () => {
        if (focusedIndex !== null) handleFlip(focusedIndex)
      },
      ' ': () => {
        if (focusedIndex !== null) handleFlip(focusedIndex)
      },
      Escape: () => setPaused(true),
      p: () => setPaused(true),
      P: () => setPaused(true),
    },
    !paused && !showCompletion,
    false,
  )

  useKeys(
    {
      p: () => setPaused(false),
      P: () => setPaused(false),
    },
    paused,
    false,
  )

  const boardStyle = {
    ['--cols' as string]: state.cols,
    ['--rows' as string]: state.rows,
  } as CSSProperties

  return (
    <GameShell
      gameId="lanterns"
      stats={[
        { label: 'Pairs', value: `${state.matchedPairs}/${state.totalPairs}` },
        { label: 'Moves', value: state.moves },
      ]}
      paused={paused}
      onPauseChange={setPaused}
      onRestart={handleRestart}
      onExit={onExit}
      howTo={
        <>
          <p>Turn two cards to reveal their astronomical sigils and find matching pairs.</p>
          <p>If two sigils differ, wait a breath or tap a third card immediately to keep going.</p>
        </>
      }
    >
      <div className="lanterns-stage">
        <div
          className="lanterns-board"
          style={boardStyle}
          role="grid"
          aria-label={`Lanterns ${state.cols} by ${state.rows} memory board, ${state.matchedPairs} of ${state.totalPairs} pairs found`}
        >
          {state.cards.map((card, index) => {
            const isFlipped = card.flipped || card.matched
            const isMismatch =
              state.mismatchPair !== null &&
              (state.mismatchPair[0] === index || state.mismatchPair[1] === index)
            const isFocused = focusedIndex === index
            const row = Math.floor(index / state.cols) + 1
            const col = (index % state.cols) + 1
            const ariaLabel = card.matched
              ? `Row ${row} column ${col}, ${sigilLabel(card.sigil)}, matched`
              : isFlipped
                ? `Row ${row} column ${col}, ${sigilLabel(card.sigil)}`
                : `Row ${row} column ${col}, face down`

            return (
              <button
                key={card.id}
                type="button"
                className="lantern-card"
                data-flipped={isFlipped || undefined}
                data-matched={card.matched || undefined}
                data-mismatch={isMismatch || undefined}
                data-focused={isFocused || undefined}
                data-tone={card.tone}
                aria-label={ariaLabel}
                aria-pressed={isFlipped}
                disabled={card.matched}
                onClick={() => {
                  setFocusedIndex(null)
                  handleFlip(index)
                }}
              >
                <span className="lantern-card__inner">
                  <span className="lantern-card__face lantern-card__face--back">
                    <CardBackMark className="lantern-card__back-mark" />
                  </span>
                  <span className="lantern-card__face lantern-card__face--front">
                    <span className="lantern-card__tick" aria-hidden />
                    <SigilMark id={card.sigil} className="lantern-card__sigil" />
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <Completion
        open={showCompletion}
        title="All paired"
        line={
          <span className="num">
            {state.moves} {state.moves === 1 ? 'move' : 'moves'}
          </span>
        }
        actionLabel="Next"
        onAction={handleNext}
      />
    </GameShell>
  )
}
