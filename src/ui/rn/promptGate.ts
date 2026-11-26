/**
 * Keeps Inverna's own prompts (the check-in, the reminder offer) from landing
 * on top of an iOS permission dialog or the end of onboarding (NAT-05).
 */
let quietUntil = 0
let asking = 0

/** Hold prompts for a moment (onboarding just finished). */
export function holdPrompts(ms: number): void {
  quietUntil = Math.max(quietUntil, Date.now() + ms)
}

/** True while a permission dialog may be up, or prompts are held. */
export function promptsHeld(): boolean {
  return asking > 0 || Date.now() < quietUntil
}

/** Run something that may show the iOS permission dialog. */
export async function whileAsking<T>(job: () => Promise<T>): Promise<T> {
  asking++
  try {
    return await job()
  } finally {
    asking--
    holdPrompts(800)
  }
}

/** Call `open` after `delayMs`, waiting longer while prompts are held. Returns a cancel. */
export function openWhenQuiet(open: () => void, delayMs: number): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  const attempt = () => {
    if (promptsHeld()) {
      timer = setTimeout(attempt, 800)
      return
    }
    timer = null
    open()
  }
  timer = setTimeout(attempt, delayMs)
  return () => {
    if (timer) clearTimeout(timer)
  }
}
