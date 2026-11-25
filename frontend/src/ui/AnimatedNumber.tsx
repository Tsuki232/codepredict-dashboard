import { animate, useReducedMotion } from 'motion/react'
import { useEffect, useRef } from 'react'

const fmt = (v: number, d: number) => (Number.isFinite(v) ? v.toFixed(d).replace('-', '−') : '—')

/**
 * Cifra que cuenta hasta su valor: desde 0 al montar y, después, desde el valor anterior.
 * Se escribe en el DOM directamente (sin re-renderizar React en cada cuadro).
 */
export function AnimatedNumber({ value, decimals = 2, duration = 0.7, className, style, format }: {
  value: number; decimals?: number; duration?: number; className?: string; style?: React.CSSProperties
  /** Cómo escribir la cifra en cada cuadro (por ejemplo `fmtInt` para «32 509»). Por defecto, `decimals` decimales con coma. */
  format?: (v: number) => string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const from = useRef(0)
  const reduce = useReducedMotion()
  const escribe = format ?? ((v: number) => fmt(v, decimals))

  useEffect(() => {
    const el = ref.current
    if (!el || !Number.isFinite(value)) return
    if (reduce) { el.textContent = escribe(value); from.current = value; return }
    const controls = animate(from.current, value, {
      duration, ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => { el.textContent = escribe(v); from.current = v },
    })
    return () => controls.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `escribe` se rehace en cada render; solo importa cuando cambia el formato de verdad
  }, [value, decimals, duration, reduce, format])

  return <span ref={ref} className={className} style={style}>{escribe(value)}</span>
}
