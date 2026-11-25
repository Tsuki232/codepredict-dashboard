import { ChevronLeft, ChevronRight, Maximize, X } from 'lucide-react'
import { useReducedMotion } from 'motion/react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Escalonado } from '../../motion/Escalonado'
import { palabras, ventana } from '../../motion/tiempo'
import { SufijoIdContext } from './marco'
import { useEscenaActiva, useVersion } from './pelicula'
import type { EscenaDef, Pelicula } from './pelicula'

/** El subtítulo de la escena: se escribe palabra por palabra al ritmo de la animación y, al terminar, queda completo. */
function Subtitulo({ p, defs }: { p: Pelicula; defs: EscenaDef[] }) {
  useVersion(p)
  if (!p.activo) return null
  const { i, k } = p.pos
  return <p className="presentacion-sub" aria-hidden>{palabras(defs[i].narracion, ventana(k, 0.02, 0.6))}</p>
}

/** Al grabar el vídeo, la escena entra y sale con un fundido que depende solo del reloj de la película (no del reloj real): cada fotograma sale idéntico siempre. */
function EscenaCaptura({ p, children }: { p: Pelicula; children: ReactNode }) {
  useVersion(p)
  const { i, k } = p.pos
  const entra = ventana(k, 0, 0.04)
  const sale = i < p.escenas.length - 1 ? ventana(k, 0.975, 1) : 0           // la última escena se queda hasta el final
  return <div style={{ opacity: entra * (1 - sale), transform: `translateY(${(1 - entra) * 14}px)` }}>{children}</div>
}

/** Una línea fina con lo que lleva avanzado el vídeo. */
function Progreso({ p }: { p: Pelicula }) {
  useVersion(p)
  return <div className="presentacion-progreso" aria-hidden><div style={{ width: `${p.total ? (p.t / p.total) * 100 : 0}%` }} /></div>
}

/**
 * Modo presentación: el tablero a pantalla completa, UNA escena a la vez y más grande, para exponer.
 * Nada avanza solo: cada escena se anima, se queda completa y espera. Teclado: ← → (o Espacio) para cambiar de escena, R repite la escena,
 * Inicio y Fin saltan al principio y al final, F pone el navegador a pantalla completa y Esc sale.
 */
export function Presentacion({ p, defs, inicio, renderEscena, onSalir, captura = false }: {
  p: Pelicula; defs: EscenaDef[]; inicio: number; renderEscena: (e: EscenaDef, i: number) => ReactNode; onSalir: () => void
  /** Para grabar el vídeo: sin controles, sin teclado y con el reloj de la película movido desde fuera (`window.__pelicula.buscar(ms)`). */
  captura?: boolean
}) {
  const raiz = useRef<HTMLDivElement>(null)
  const x0 = useRef<number | null>(null)
  const activa = useEscenaActiva(p)
  const reducir = useReducedMotion() ?? false
  const [zoom, setZoom] = useState(1)
  const n = defs.length

  // La película entra en modo diapositivas mientras dura la presentación y vuelve a quedar apagada al salir.
  useEffect(() => {
    if (captura) { p.buscar(0); return }                                   // quien graba mueve el reloj
    p.fijarDiapositivas(true)
    p.ir(Math.max(0, Math.min(inicio, n - 1)))
    return () => { p.fijarDiapositivas(false); p.salir() }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `inicio` solo importa al abrir
  }, [p])

  // Lo de atrás queda inerte (ni foco ni lector de pantalla), la página no se desplaza y al salir el foco vuelve a donde estaba.
  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null
    const root = document.getElementById('root')
    const overflow = document.body.style.overflow
    root?.setAttribute('inert', '')
    document.body.style.overflow = 'hidden'
    raiz.current?.focus()
    return () => {
      root?.removeAttribute('inert')
      document.body.style.overflow = overflow
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => { /* ya había salido */ })
      previo?.focus?.()
    }
  }, [])

  // Cada escena se agranda o se encoge para llenar la pantalla SIN salirse: se mide su altura real y se corrige el zoom (en pocos pasos, antes de pintar).
  // La escena mide 1 180 px de ancho natural, así que su altura crece en proporción al zoom y un par de pasadas bastan.
  const cuerpo = useRef<HTMLDivElement>(null)
  const caja = useRef<HTMLDivElement>(null)
  const pasos = useRef(0)
  const [medida, setMedida] = useState(0)                      // sube cuando cambia el tamaño de la ventana o de la escena: pide volver a medir
  useEffect(() => {
    pasos.current = 0
    const pide = () => setMedida((m) => m + 1)
    const alCambiarVentana = () => { pasos.current = 0; pide() }
    window.addEventListener('resize', alCambiarVentana)
    const ro = typeof ResizeObserver !== 'undefined' && caja.current ? new ResizeObserver(pide) : null
    if (ro && caja.current) ro.observe(caja.current)
    return () => { window.removeEventListener('resize', alCambiarVentana); ro?.disconnect() }
  }, [activa])
  useLayoutEffect(() => {
    const c = cuerpo.current
    const s = caja.current
    if (!c || !s || pasos.current > 8) return                  // el tope evita que dos medidas se persigan para siempre
    pasos.current++
    const est = getComputedStyle(c)
    const ancho = c.clientWidth - parseFloat(est.paddingLeft) - parseFloat(est.paddingRight)
    const alto = c.clientHeight - parseFloat(est.paddingTop) - parseFloat(est.paddingBottom)
    const natural = s.getBoundingClientRect().height / zoom
    if (!(natural > 0) || !(alto > 0)) return
    const objetivo = Math.max(0.5, Math.min(1.6, ancho / 1180, (alto * 0.97) / natural))      // un poco de aire para que la escena no roce el subtítulo
    if (Math.abs(objetivo - zoom) > 0.004) setZoom(objetivo)
  }, [zoom, activa, medida])

  const pantallaCompleta = () => {
    try {
      if (document.fullscreenElement) void document.exitFullscreen()
      else void document.documentElement.requestFullscreen()
    } catch { /* el navegador no lo permite aquí: la presentación ya ocupa toda la ventana */ }
  }
  const siguiente = () => { if (activa < n - 1) p.siguiente() }
  const anterior = () => { if (activa > 0) p.anterior() }

  useEffect(() => {
    if (captura) return
    const alTeclear = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (e.key === 'Escape') { e.preventDefault(); onSalir(); return }
      if (t?.closest('input, textarea, select')) return
      const enPestanas = !!t?.closest('[role="tablist"]')           // las flechas de «Java | Python» cambian de pestaña, no de escena
      switch (e.key) {
        case 'ArrowRight': case 'PageDown': if (enPestanas) return; e.preventDefault(); siguiente(); break
        case 'ArrowLeft': case 'PageUp': if (enPestanas) return; e.preventDefault(); anterior(); break
        case ' ': case 'Enter': if (t?.closest('button, a, summary, [role="tab"]')) return; e.preventDefault(); siguiente(); break
        case 'Home': e.preventDefault(); p.ir(0); break
        case 'End': e.preventDefault(); p.ir(n - 1); break
        case 'r': case 'R': e.preventDefault(); p.ir(Math.max(0, activa)); break
        case 'f': case 'F': e.preventDefault(); pantallaCompleta(); break
      }
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- siguiente/anterior solo dependen de `activa`, que sí está
  }, [p, n, activa, onSalir])

  const e = activa >= 0 ? defs[activa] : null
  return createPortal(
    <div ref={raiz} className="presentacion" data-captura={captura ? 'true' : undefined} role="dialog" aria-modal="true" aria-label="Modo presentación del tablero" tabIndex={-1}>
      <p className="sr-only" role="status" aria-live="polite">{e ? `Escena ${activa + 1} de ${n}: ${e.titulo}. ${e.narracion}` : ''}</p>
      <div className="presentacion-top">
        <p className="presentacion-titulo">{e ? <><b>{activa + 1}</b> / {n} · {e.titulo}</> : 'Presentación'}</p>
        <div className="flex gap-2">
          <button type="button" className="btn-icon" onClick={pantallaCompleta} aria-label="Pantalla completa del navegador (F)" title="Pantalla completa (F)"><Maximize size={16} aria-hidden /></button>
          <button type="button" className="btn-icon" onClick={onSalir} aria-label="Salir de la presentación (Esc)" title="Salir (Esc)"><X size={16} aria-hidden /></button>
        </div>
      </div>

      <div ref={cuerpo} className="presentacion-cuerpo"
        onPointerDown={(ev) => { x0.current = ev.clientX }}
        onPointerUp={(ev) => { if (x0.current !== null && ev.pointerType === 'touch') { const dx = ev.clientX - x0.current; if (dx < -70) siguiente(); else if (dx > 70) anterior() } x0.current = null }}>
        <button type="button" className="presentacion-flecha izq" onClick={anterior} disabled={activa <= 0} aria-label="Escena anterior"><ChevronLeft size={26} aria-hidden /></button>
        {e && (
          <div ref={caja} className="presentacion-escena" style={{ zoom }}>
            <SufijoIdContext.Provider value="-p">
              {captura
                ? <EscenaCaptura key={e.id} p={p}>{renderEscena(e, activa)}</EscenaCaptura>
                : <Escalonado key={e.id}>{renderEscena(e, activa)}</Escalonado>}
            </SufijoIdContext.Provider>
          </div>
        )}
        <button type="button" className="presentacion-flecha der" onClick={siguiente} disabled={activa >= n - 1} aria-label="Escena siguiente"><ChevronRight size={26} aria-hidden /></button>
      </div>

      <div className="presentacion-pie">
        <Subtitulo p={p} defs={defs} />
        <ol className="presentacion-puntos" aria-label="Escenas">
          {defs.map((d, j) => (
            <li key={d.id}><button type="button" className="presentacion-punto" data-activa={j === activa} data-vista={j < activa} onClick={() => p.ir(j)} aria-label={`Ir a la escena ${j + 1}: ${d.titulo}`} title={`${j + 1}. ${d.titulo}`} /></li>
          ))}
        </ol>
        <p className="presentacion-ayuda" aria-hidden>← → cambiar de escena · R repetir · F pantalla completa · Esc salir{reducir ? ' · movimiento reducido' : ''}</p>
      </div>
      {captura && <Progreso p={p} />}
    </div>,
    document.body,
  )
}
