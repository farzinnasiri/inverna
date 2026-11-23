import { useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Check, Sun } from 'lucide-react'
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
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" aria-label={label} title={label} className={`icon-btn ${className}`} {...rest} />
  )
}

/* -------------------------------------------------------------------------- */

/** Hold for 1.6s to confirm destructive action. */
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

/**
 * Control-Center style Light slider (56px rounded track).
 * Dragging left lowers light (higher `light` dim/warmth), dragging right raises brightness.
 * `value` is `light` (0 = bright/normal, 1 = lowest). Visually, fill shows brightness `1 - value`
 * so dragging left = dimmer feels immediately physical like iOS Control Center.
 */
export function LightSlider({
  value,
  onChange,
  label = 'Light',
}: {
  value: number
  onChange: (nextLight: number) => void
  label?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const brightness = Math.min(1, Math.max(0, 1 - value))

  const fromX = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect()
    const b = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
    const nextLight = Math.round((1 - b) * 50) / 50
    onChange(nextLight)
  }

  return (
    <div
      ref={ref}
      className="light-slider"
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(brightness * 100)}
      aria-valuetext={`${Math.round(brightness * 100)}% brightness`}
      data-dragging={dragging}
      style={{ ['--v' as string]: brightness }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        setDragging(true)
        fromX(e.clientX)
      }}
      onPointerMove={(e) => dragging && fromX(e.clientX)}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
      onKeyDown={(e) => {
        const step = 0.06
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
          e.preventDefault()
          onChange(Math.max(0, Number((value - step).toFixed(2))))
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
          e.preventDefault()
          onChange(Math.min(1, Number((value + step).toFixed(2))))
        }
      }}
    >
      <div className="light-slider__fill" />
      <span className="light-slider__icon" style={{ opacity: 0.35 + brightness * 0.65 }} aria-hidden>
        <Sun size={20} strokeWidth={1.5} />
      </span>
    </div>
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

/** Compact popover menu for small pickers (Timer, Wind-down sound). */
export function PopoverMenu<T extends string | number | null>({
  open,
  onClose,
  options,
  value,
  onSelect,
  align = 'center',
  direction = 'up',
  label,
}: {
  open: boolean
  onClose: () => void
  options: readonly { value: T; label: string }[]
  value: T
  onSelect: (v: T) => void
  align?: 'center' | 'right'
  direction?: 'up' | 'down'
  label: string
}) {
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
          <div className="menu-backdrop" onClick={onClose} />
          <motion.div
            className={`menu-pop ${direction === 'down' ? 'menu-pop--down' : ''} ${align === 'right' ? 'menu-pop--right' : ''}`}
            role="listbox"
            aria-label={label}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.16, ease: easeArray.out }}
          >
            {options.map((o) => {
              const selected = o.value === value
              return (
                <button
                  key={String(o.value)}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className="menu-opt"
                  onClick={() => {
                    onSelect(o.value)
                    onClose()
                  }}
                >
                  <span>{o.label}</span>
                  {selected && <Check size={15} strokeWidth={1.75} aria-hidden />}
                </button>
              )
            })}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

/* -------------------------------------------------------------------------- */

/** Bottom sheet with spring/flick-to-dismiss. */
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
            transition={{ duration: 0.25, ease: easeArray.out }}
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
              transition={{ duration: 0.4, ease: easeArray.drawer }}
              drag={reduce ? false : 'y'}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0.04, bottom: 0.9 }}
              onDragEnd={(_, info) => {
                if (info.offset.y > 110 || info.velocity.y > 500) onClose()
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
