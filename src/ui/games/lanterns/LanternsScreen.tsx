import { useState } from 'react'
import { GameShell, type GameScreenProps } from '@/ui/components/GameShell'

export default function LanternsScreen({ onExit }: GameScreenProps) {
  const [paused, setPaused] = useState(false)
  return (
    <GameShell gameId="lanterns" paused={paused} onPauseChange={setPaused} onExit={onExit} howTo={<p>Coming soon.</p>}>
      <p className="t-label">Loading…</p>
    </GameShell>
  )
}
