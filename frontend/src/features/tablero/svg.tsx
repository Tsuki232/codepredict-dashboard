import { useState } from 'react'
import type { ReactNode } from 'react'

/** Duración de cada escena de la película, en milisegundos (el tiempo que dura la animación más el que se deja para leer). */
export const DUR = {
  portada: 6500, embudo: 7500, distribucion: 9000, riesgo: 8500, probabilidad: 10000,
  welch: 9000, permutacion: 9000, neurona: 10000, iaTasas: 10000, iaDetalle: 10000, cierre: 8000,
} as const

/** Piezas del cuadro de cifras que aparece al pasar el cursor por una gráfica. */
export function TipTitulo({ children }: { children: ReactNode }) { return <p className="tip-t">{children}</p> }
export function TipFila({ color, children }: { color?: string; children: ReactNode }) {
  return <p className="tip-f">{color && <span className="tip-p" style={{ background: color }} aria-hidden />}{children}</p>
}

/** Bandas verticales iguales (un tramo, una barra): qué banda cae bajo la posición `xVista` (en unidades del viewBox), o null si queda fuera. */
export function indiceBanda(xVista: number, x0: number, banda: number, n: number): number | null {
  if (!(banda > 0)) return null
  const i = Math.floor((xVista - x0) / banda)
  return i >= 0 && i < n ? i : null
}

/** Interacción de una gráfica por bandas: una cruz que acompaña al cursor, un cuadro con las cifras y el mismo recorrido con las flechas del teclado. */
export interface Interactivo {
  n: number
  x0: number
  banda: number
  /** Lo que dice el cuadro de la banda `i`. */
  contenido: (i: number) => ReactNode
  /** Formas SVG que se dibujan encima de la banda `i` (franja, guía). No reciben el puntero. */
  resaltar?: (i: number) => ReactNode
}

/**
 * Lienzo SVG de ancho libre (el de la t de Student tiene un ancho fijo de 1000). Con pantallas angostas se desliza de lado en vez de encogerse.
 * Con `interactivo` la gráfica responde al cursor y al teclado (Tab para entrar, ← → para recorrer, Esc para salir).
 */
export function Svg({ ancho, alto, titulo, descripcion, minimo, maximo, interactivo, children }: {
  ancho: number; alto: number; titulo: string; descripcion: string; minimo?: number; maximo?: number; interactivo?: Interactivo; children: ReactNode
}) {
  const [hover, setHover] = useState<number | null>(null)
  const [pct, setPct] = useState(50)                         // posición horizontal del cuadro, en % del ancho (no depende del zoom de la página)
  const it = interactivo

  const mover = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!it) return
    const r = e.currentTarget.getBoundingClientRect()
    const i = indiceBanda(((e.clientX - r.left) / r.width) * ancho, it.x0, it.banda, it.n)
    setHover(i)
    if (i !== null) setPct(((it.x0 + (i + 0.5) * it.banda) / ancho) * 100)
  }
  const teclas = (e: React.KeyboardEvent) => {
    if (!it) return
    const mueve = (i: number) => { const j = (i + it.n) % it.n; setHover(j); setPct(((it.x0 + (j + 0.5) * it.banda) / ancho) * 100) }
    if (e.key === 'ArrowRight') { e.preventDefault(); mueve((hover ?? -1) + 1) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); mueve((hover ?? it.n) - 1) }
    else if (e.key === 'Escape' && hover !== null) { e.stopPropagation(); setHover(null) }
  }

  return (
    <div className="mx-auto w-full overflow-x-auto" style={{ overscrollBehaviorX: 'contain', maxWidth: maximo }}>
      <div className="relative" style={{ minWidth: minimo ?? Math.min(ancho, 600) }}>
        <svg viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label={`${titulo}. ${descripcion}${it ? ' Con el teclado: flechas izquierda y derecha para ver cada valor.' : ''}`} className="block w-full"
          style={{ overflow: 'visible', touchAction: 'pan-y', outlineOffset: 4 }}
          {...(it ? { tabIndex: 0, onPointerMove: mover, onPointerDown: mover, onPointerLeave: () => setHover(null), onKeyDown: teclas, onBlur: () => setHover(null) } : {})}>
          <title>{titulo}</title>
          <desc>{descripcion}</desc>
          {children}
          {it && hover !== null && <g pointerEvents="none" aria-hidden>{it.resaltar?.(hover)}</g>}
        </svg>
        {it && hover !== null && (
          <div className="tip" style={{ left: `${pct}%`, transform: pct > 58 ? 'translateX(calc(-100% - 14px))' : 'translateX(14px)' }} aria-hidden>{it.contenido(hover)}</div>
        )}
      </div>
    </div>
  )
}

/** Máximo «bonito» (1, 2, 2,5, 5, 10 × 10ⁿ) por encima de `v`, para que el eje no termine justo en el dato más alto. */
export function techo(v: number): number {
  if (!(v > 0)) return 1
  const pot = Math.pow(10, Math.floor(Math.log10(v)))
  return ([1, 2, 2.5, 5, 10].map((f) => f * pot).find((x) => x >= v * 1.04)) ?? pot * 10
}

export const pct0 = (v: number) => `${Math.round(v * 100)} %`
