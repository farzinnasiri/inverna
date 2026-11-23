import { useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { easeArray } from '@/design/tokens'

/* -------------------------------------------------------------------------- */

type BtnVariant = 'primary' | 'quiet' | 'ghost'

export function Button({
  variant = 'quiet',
  size,
  block,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm'; block?: boolean }) {
  return (
    <button
      type="button"
      className={`btn btn--${variant} ${size ? `btn--${size}` : ''} ${block ? 'btn--block' : ''} ${className}`}
      {...rest}
    />
  )
}

export function IconButton({
  label,
  filled,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; filled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`icon-btn ${filled ? 'icon-btn--filled' : ''} ${className}`}
      {...rest}
    />
  )
}

/* -------------------------------------------------------------------------- */

/** Hold for 1.6s to confirm. Slow where the user decides, snappy on release. */
export function HoldButton({ children, onConfirm }: { children: ReactNode; onConfirm: () => void }) {
  const [holding, setHolding] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const start = () => {
    setHolding(true)
    timer.current = window.setTimeout(() => {
      setHolding(false)
      onConfirm()
    }, 1600)
  }
  const cancel = () => {
    setHolding(false)
    window.clearTimeout(timer.current)
  }
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return (
    <button
      type="button"
      className="btn btn--block hold"
      data-holding={holding}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !e.repeat && start()}
      onKeyUp={cancel}
    >
      <span className="hold__fill" aria-hidden />
      <span className="hold__label">{children}</span>
    </button>
  )
}

/* -------------------------------------------------------------------------- */

export function Slider({
  value,
  onChange,
  label,
  min = 0,
  max = 1,
  step = 0.01,
  format,
  dimmedWhenZero,
}: {
  value: number
  onChange: (v: number) => void
  label: string
  min?: number
  max?: number
  step?: number
  format?: (v: number) => string
  dimmedWhenZero?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  const [dragging, setDragging] = useState(false)
  const t = (value - min) / (max - min)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const fromX = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect()
    const raw = min + ((clientX - r.left) / r.width) * (max - min)
    const snapped = Math.round(raw / step) * step
    onChange(Math.min(max, Math.max(min, Number(snapped.toFixed(4)))))
  }

  return (
    <div
      ref={ref}
      className="slider"
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={format ? format(value) : undefined}
      data-dragging={dragging}
      data-off={dimmedWhenZero && value <= min}
      style={{ ['--v' as string]: t, ['--w' as string]: `${w}px` }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        setDragging(true)
        fromX(e.clientX)
      }}
      onPointerMove={(e) => dragging && fromX(e.clientX)}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
      onKeyDown={(e) => {
        const big = (max - min) / 10
        const delta =
          e.key === 'ArrowRight' || e.key === 'ArrowUp'
            ? step * 5
            : e.key === 'ArrowLeft' || e.key === 'ArrowDown'
              ? -step * 5
              : e.key === 'PageUp'
                ? big
                : e.key === 'PageDown'
                  ? -big
                  : 0
        if (delta) {
          e.preventDefault()
          onChange(Math.min(max, Math.max(min, Number((value + delta).toFixed(4)))))
        }
      }}
    >
      <div className="slider__track">
        <div className="slider__fill" />
      </div>
      <div className="slider__thumb" />
    </div>
  )
}

/* -------------------------------------------------------------------------- */

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: ReactNode }[]
  value: T
  onChange: (v: T) => void
  label: string
}) {
  const i = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  )
  return (
    <div className="seg" role="radiogroup" aria-label={label} style={{ ['--n' as string]: options.length, ['--i' as string]: i }}>
      <span className="seg__indicator" aria-hidden />
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className="seg__opt"
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------------- */

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className="toggle" onClick={() => onChange(!checked)} />
  )
}

/* -------------------------------------------------------------------------- */

/**
 * Bottom sheet. Drawer curve in, drag or flick down to dismiss
 * (velocity counts, not just distance). Backdrop tap and Escape close it.
 */
export function Sheet({
  open,
  onClose,
  children,
  label,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  label: string
}) {
  const reduce = useReducedMotion()
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            className="sheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: easeArray.out }}
            onClick={onClose}
          />
          <div className="sheet-wrap" key="wrap">
            <motion.div
              className="sheet"
              role="dialog"
              aria-modal="true"
              aria-label={label}
              initial={reduce ? { opacity: 0 } : { y: '100%' }}
              animate={reduce ? { opacity: 1 } : { y: 0 }}
              exit={reduce ? { opacity: 0 } : { y: '100%' }}
              transition={{ duration: 0.44, ease: easeArray.drawer }}
              drag={reduce ? false : 'y'}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0.05, bottom: 0.9 }}
              onDragEnd={(_, info) => {
                if (info.offset.y > 120 || info.velocity.y > 500) onClose()
              }}
            >
              <div className="sheet__grab" aria-hidden />
              {children}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
