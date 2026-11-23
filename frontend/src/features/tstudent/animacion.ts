import { useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'

/** Un valor que se acerca suavemente a `objetivo` (un deslizador, un zoom…). Con «reducir movimiento» salta directo. */
export function useSuave(objetivo: number, ms = 600): number {
  const reducir = useReducedMotion()
  const [v, setV] = useState(objetivo)
  const actual = useRef(objetivo)
  useEffect(() => {
    if (reducir) { actual.current = objetivo; setV(objetivo); return }
    const desde = actual.current
    const t0 = performance.now()
    let raf = 0
    const paso = (t: number) => {
      const k = Math.min(1, (t - t0) / ms)
      const x = desde + (objetivo - desde) * (1 - Math.pow(1 - k, 3))     // sale rápido y frena al llegar
      actual.current = x
      setV(x)
      if (k < 1) raf = requestAnimationFrame(paso)
    }
    raf = requestAnimationFrame(paso)
    return () => cancelAnimationFrame(raf)
  }, [objetivo, ms, reducir])
  return v
}

/** Una reproducción de 0 a 1 en `ms` milisegundos, para mostrar un proceso paso a paso. `reproducir()` la vuelve a empezar. */
export function useReproduccion(ms: number, alEntrar = true): { k: number; reproducir: () => void; corriendo: boolean; ref: React.RefObject<HTMLDivElement | null> } {
  const reducir = useReducedMotion()
  const [k, setK] = useState(reducir ? 1 : 0)
  const [corriendo, setCorriendo] = useState(false)
  const raf = useRef(0)
  const ref = useRef<HTMLDivElement | null>(null)

  const reproducir = useCallback(() => {
    cancelAnimationFrame(raf.current)
    if (reducir) { setK(1); setCorriendo(false); return }
    const t0 = performance.now()
    setCorriendo(true)
    const paso = (t: number) => {
      const x = Math.min(1, (t - t0) / ms)
      setK(x)
      if (x < 1) raf.current = requestAnimationFrame(paso)
      else setCorriendo(false)
    }
    setK(0)
    raf.current = requestAnimationFrame(paso)
  }, [ms, reducir])

  // Empieza sola la primera vez que la sección entra en pantalla.
  useEffect(() => {
    if (!alEntrar || !ref.current || typeof IntersectionObserver === 'undefined') return
    const obs = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { reproducir(); obs.disconnect() } }, { threshold: 0.35 })
    obs.observe(ref.current)
    return () => obs.disconnect()
  }, [alEntrar, reproducir])

  useEffect(() => () => cancelAnimationFrame(raf.current), [])
  return { k, reproducir, corriendo, ref }
}
