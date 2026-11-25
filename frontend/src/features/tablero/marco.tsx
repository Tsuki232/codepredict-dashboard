import { RotateCcw } from 'lucide-react'
import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import { Panel } from '../../ui/Panel'
import { useReproduccion } from '../tstudent/animacion'
import type { IaFuenteId } from './tipos'
import { useEscenaActiva, useKEscena } from './pelicula'
import type { Pelicula } from './pelicula'

/** Colores del tablero: «con bug» y «sin bug» siguen el criterio de la vista de inferencia; cada fuente de código tiene el suyo (y siempre su nombre escrito al lado). */
export const COLOR_BUG = { con: 'var(--serie-2)', sin: 'var(--serie-1)' } as const
export const COLOR_FUENTE: Record<IaFuenteId, string> = { human: 'var(--serie-3)', chatgpt: 'var(--serie-1)', dsc: 'var(--serie-4)', qwen: 'var(--serie-5)' }

/** Texto que se añade al id de cada escena: la vista de presentación dibuja las mismas escenas que el tablero y los ids no pueden repetirse. */
export const SufijoIdContext = createContext('')

/**
 * Progreso de la escena `i`: el de la película si está encendida; si no, el suyo propio, que arranca solo cuando la escena entra en pantalla.
 * `repetir` vuelve a verla desde el principio en cualquiera de los dos modos.
 */
export function useK(p: Pelicula, i: number, ms: number) {
  const libre = useReproduccion(ms, true)
  const pelicula = useKEscena(p, i)
  const k = pelicula >= 0 ? pelicula : libre.k
  const repetir = () => { if (p.activo) p.ir(i); else libre.reproducir() }
  return { k, ref: libre.ref, repetir }
}

/** El marco de cada escena: un panel con número, botón de repetir y, abajo, los datos exactos de la gráfica en una tabla. */
export function MarcoEscena({ p, i, n, id, titulo, nota, repetir, refEscena, children, pie, datos }: {
  p: Pelicula; i: number; n: number; id: string; titulo: string; nota?: string
  repetir: () => void; refEscena: React.RefObject<HTMLDivElement | null>
  children: ReactNode; pie?: ReactNode; datos?: { cabeza: string[]; filas: (string | number)[][] }
}) {
  const activa = useEscenaActiva(p)
  const sufijo = useContext(SufijoIdContext)
  const estado = activa < 0 ? 'libre' : activa === i ? 'activa' : 'otra'
  return (
    <div ref={refEscena} id={`escena-${id}${sufijo}`} className="escena" data-estado={estado}>
      <Panel title={`${n}. ${titulo}`} note={nota}>
        <div className="escena-herr">
          <button type="button" className="chip" style={{ height: 28, fontSize: '0.8125rem' }} onClick={repetir} aria-label={`Repetir la escena ${n}: ${titulo}`}>
            <RotateCcw size={13} aria-hidden /> <span className="ml-1.5">Repetir</span>
          </button>
        </div>
        {children}
        {pie && <div className="escena-pie small mt-4" style={{ color: 'var(--ink-2)' }}>{pie}</div>}
        {datos && (
          <details className="escena-datos">
            <summary>Ver los datos de esta escena como tabla</summary>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead><tr>{datos.cabeza.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
                <tbody>{datos.filas.map((f, j) => <tr key={j}>{f.map((c, m) => <td key={m}>{c}</td>)}</tr>)}</tbody>
              </table>
            </div>
          </details>
        )}
      </Panel>
    </div>
  )
}

/** Barra horizontal que crece con `k` (usa transform, no ancho: no mueve el diseño). El texto va fuera de la barra. */
export function BarraH({ frac, color, k = 1, alto = 14, rayas = false, titulo, suave = false }: { frac: number; color: string; k?: number; alto?: number; rayas?: boolean; titulo?: string; suave?: boolean }) {
  // `suave` se activa cuando la escena ya terminó de dibujarse: entonces un cambio de datos (Java ↔ Python) transforma la barra en vez de saltar.
  return (
    <div className="barra-pista" style={{ height: alto }} title={titulo}>
      <div className="barra-relleno" style={{ transform: `scaleX(${Math.max(0, Math.min(1, frac)) * k})`, transition: suave ? 'transform 650ms var(--ease-out)' : undefined, background: rayas ? `repeating-linear-gradient(45deg, ${color} 0 3px, color-mix(in srgb, ${color} 35%, transparent) 3px 6px)` : color }} />
    </div>
  )
}
