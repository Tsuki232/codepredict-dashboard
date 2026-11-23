import type { ReactNode } from 'react'

/** Piezas comunes para dibujar las gráficas en SVG a mano: escalas, ejes con números, curvas y áreas sombreadas. */

export const ANCHO = 1000
export const ALTO = 440
export const MARGEN = { l: 64, r: 28, t: 28, b: 56 }

export type Pt = [number, number]
export type Escala = (v: number) => number

export function escala(dom: [number, number], rango: [number, number]): Escala {
  const [d0, d1] = dom
  const [r0, r1] = rango
  return (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0)
}

/** Marcas «bonitas» (1, 2, 5 × 10ⁿ) entre min y max, unas `n` aproximadamente. */
export function marcas(min: number, max: number, n = 6): number[] {
  const crudo = (max - min) / n
  const pot = Math.pow(10, Math.floor(Math.log10(crudo)))
  const paso = [1, 2, 5, 10].map((f) => f * pot).find((p) => p >= crudo) ?? pot * 10
  const ini = Math.ceil(min / paso) * paso
  const out: number[] = []
  for (let v = ini; v <= max + paso * 1e-9; v += paso) out.push(Math.abs(v) < paso * 1e-9 ? 0 : Number(v.toPrecision(12)))
  return out
}

export const num = (x: number, d = 2) => x.toLocaleString('es-CO', { maximumFractionDigits: d })

/** «M x,y L x,y …» a partir de puntos y escalas. */
export function ruta(pts: Pt[], X: Escala, Y: Escala): string {
  return pts.map(([x, y], i) => `${i ? 'L' : 'M'}${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join('')
}

/** Región bajo la curva entre a y b (para sombrear un área = una probabilidad). */
export function areaBajo(pts: Pt[], a: number, b: number, X: Escala, Y: Escala, base = 0): string {
  const dentro = pts.filter(([x]) => x >= a && x <= b)
  if (dentro.length < 2) return ''
  const p = dentro.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join('L')
  return `M${X(dentro[0][0]).toFixed(1)},${Y(base).toFixed(1)}L${p}L${X(dentro[dentro.length - 1][0]).toFixed(1)},${Y(base).toFixed(1)}Z`
}

export function Lienzo({ titulo, descripcion, children, alto = ALTO }: { titulo: string; descripcion: string; children: ReactNode; alto?: number }) {
  // En pantallas angostas la gráfica no se encoge hasta que el texto sea ilegible: conserva un ancho mínimo y se desliza de lado.
  return (
    <div className="overflow-x-auto" style={{ overscrollBehaviorX: 'contain' }}>
      <svg viewBox={`0 0 ${ANCHO} ${alto}`} role="img" aria-label={`${titulo}. ${descripcion}`} className="block w-full min-w-[760px]" style={{ overflow: 'visible' }}>
        <title>{titulo}</title>
        <desc>{descripcion}</desc>
        {children}
      </svg>
    </div>
  )
}

export function EjeX({ X, marcasX, y, etiqueta, formato = (v: number) => num(v, 1) }: { X: Escala; marcasX: number[]; y: number; etiqueta?: string; formato?: (v: number) => string }) {
  return (
    <g aria-hidden>
      <line x1={X(marcasX[0])} x2={X(marcasX[marcasX.length - 1])} y1={y} y2={y} stroke="var(--grid-strong)" />
      {marcasX.map((v) => (
        <g key={v}>
          <line x1={X(v)} x2={X(v)} y1={y} y2={y + 5} stroke="var(--grid-strong)" />
          <text x={X(v)} y={y + 20} textAnchor="middle" fontSize="12" fill="var(--muted)">{formato(v)}</text>
        </g>
      ))}
      {etiqueta && <text x={(X(marcasX[0]) + X(marcasX[marcasX.length - 1])) / 2} y={y + 44} textAnchor="middle" fontSize="13" fill="var(--ink-2)">{etiqueta}</text>}
    </g>
  )
}

export function EjeY({ Y, marcasY, x, xFin, etiqueta, formato = (v: number) => num(v, 2) }: { Y: Escala; marcasY: number[]; x: number; xFin: number; etiqueta?: string; formato?: (v: number) => string }) {
  return (
    <g aria-hidden>
      {marcasY.map((v) => (
        <g key={v}>
          <line x1={x} x2={xFin} y1={Y(v)} y2={Y(v)} stroke="var(--grid)" strokeDasharray={v === 0 ? undefined : '2 5'} />
          <text x={x - 10} y={Y(v) + 4} textAnchor="end" fontSize="12" fill="var(--muted)">{formato(v)}</text>
        </g>
      ))}
      {etiqueta && <text transform={`translate(16 ${(Y(marcasY[0]) + Y(marcasY[marcasY.length - 1])) / 2}) rotate(-90)`} textAnchor="middle" fontSize="13" fill="var(--ink-2)">{etiqueta}</text>}
    </g>
  )
}

/** Patrón de rayas para zonas de rechazo: no depende solo del color (se distingue también en blanco y negro). */
export function PatronRayas({ id, color }: { id: string; color: string }) {
  return (
    <defs>
      <pattern id={id} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="7" height="7" fill={color} fillOpacity="0.16" />
        <line x1="0" y1="0" x2="0" y2="7" stroke={color} strokeWidth="2.4" strokeOpacity="0.7" />
      </pattern>
    </defs>
  )
}

/** Cuadro de explicación junto a cada gráfica: qué se ve, cómo leerlo y qué significa. */
export function ComoLeerla({ titulo = 'Cómo leerla', children }: { titulo?: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border p-4" style={{ borderColor: 'var(--rule)', background: 'color-mix(in srgb, var(--serie-1) 4%, var(--paper))' }}>
      <p className="mb-2 font-semibold">{titulo}</p>
      <div className="small flex flex-col gap-2" style={{ color: 'var(--ink-2)' }}>{children}</div>
    </div>
  )
}
