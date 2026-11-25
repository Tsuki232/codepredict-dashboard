import { useEffect, useMemo, useRef, useState } from 'react'
import { fmt, fmtInt, fmtPct } from '../../lib/format'

export interface HistSeries {
  id: string
  label: string
  color: string // var(--token)
  counts: number[]
  /** 'fill' = barras rellenas; 'outline' = solo contorno (sirve de referencia detrás). */
  style?: 'fill' | 'outline'
}
export interface VMark { value: number; label: string; color: string }

interface Props {
  edges: number[]
  series: HistSeries[]
  marks?: VMark[]
  /** Si es true, cada serie se muestra como proporción de sus propios datos (para comparar grupos de distinto tamaño). */
  normalize?: boolean
  xLabel: string
  yLabel?: string
  height?: number
  ariaLabel: string
}

const M = { top: 16, right: 18, bottom: 46, left: 66 }

function niceTicks(lo: number, hi: number, target = 5): number[] {
  const span = hi - lo || 1
  const raw = span / target
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw
  const out: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10))
  return out
}

/**
 * Histograma con eje X logarítmico (las métricas de código son muy asimétricas: la mayoría de archivos es pequeña
 * y unos pocos son enormes). Barras SVG propias, con valores al pasar el puntero y marcas verticales opcionales.
 */
export function LogHistogram({ edges, series, marks = [], normalize = false, xLabel, yLabel, height = 300, ariaLabel }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(320)
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const totals = useMemo(() => Object.fromEntries(series.map((s) => [s.id, s.counts.reduce((a, b) => a + b, 0)])), [series])
  const val = (s: HistSeries, i: number) => (normalize ? (totals[s.id] ? s.counts[i] / totals[s.id] : 0) : s.counts[i])
  const yMax = Math.max(1e-9, ...series.flatMap((s) => s.counts.map((_, i) => val(s, i)))) * 1.06

  const lx0 = Math.log10(edges[0]), lx1 = Math.log10(edges[edges.length - 1])
  const iw = w - M.left - M.right, ih = height - M.top - M.bottom
  const sx = (v: number) => M.left + ((Math.log10(Math.max(v, edges[0])) - lx0) / (lx1 - lx0 || 1)) * iw
  const sy = (v: number) => M.top + ih - (v / yMax) * ih
  const yt = niceTicks(0, yMax, 5)
  const xt: number[] = []
  for (let p = Math.ceil(lx0 - 1e-9); p <= lx1 + 1e-9; p++) xt.push(10 ** p)

  const binAt = (clientX: number, left: number): number | null => {
    const px = clientX - left
    if (px < M.left || px > w - M.right) return null
    const v = 10 ** (lx0 + ((px - M.left) / iw) * (lx1 - lx0))
    let lo = 0, hi = edges.length - 1
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (edges[mid] <= v) lo = mid; else hi = mid }
    return Math.min(lo, edges.length - 2)
  }

  const yText = (v: number) => (normalize ? fmtPct(v, 0) : fmtInt(v))

  return (
    <div ref={wrap} className="relative w-full min-w-0 select-none">
      <svg width={w} height={height} viewBox={`0 0 ${w} ${height}`} role="img" aria-label={ariaLabel}
        onPointerMove={(e) => setHover(binAt(e.clientX, e.currentTarget.getBoundingClientRect().left))}
        onPointerLeave={() => setHover(null)} style={{ touchAction: 'pan-y', maxWidth: '100%', height: 'auto' }}>
        <rect x={M.left} y={M.top} width={iw} height={ih} fill="var(--paper)" />
        {xt.map((v) => <line key={`gx${v}`} x1={sx(v)} x2={sx(v)} y1={M.top} y2={M.top + ih} stroke="var(--grid)" />)}
        {yt.map((v) => (
          <g key={`y${v}`}>
            <line x1={M.left} x2={w - M.right} y1={sy(v)} y2={sy(v)} stroke="var(--grid)" />
            <text x={M.left - 8} y={sy(v) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">{yText(v)}</text>
          </g>
        ))}
        <rect x={M.left} y={M.top} width={iw} height={ih} fill="none" stroke="var(--rule)" />
        {xt.map((v) => (
          <text key={`x${v}`} x={sx(v)} y={height - M.bottom + 16} textAnchor="middle" fontSize={11} fill="var(--muted)">{fmtInt(v)}</text>
        ))}
        <text x={M.left + iw / 2} y={height - 8} textAnchor="middle" fontSize={12} fill="var(--muted)">{xLabel} (escala logarítmica)</text>
        <text transform={`translate(14 ${M.top + ih / 2}) rotate(-90)`} textAnchor="middle" fontSize={12} fill="var(--muted)">
          {yLabel ?? (normalize ? 'Proporción del grupo' : 'Archivos')}
        </text>

        {series.map((s) => (
          <g key={s.id}>
            {s.counts.map((_, i) => {
              const x0 = sx(edges[i]), x1 = sx(edges[i + 1]), top = sy(val(s, i))
              const h = Math.max(0, M.top + ih - top)
              if (s.style === 'outline') {
                return <rect key={i} className="entra-barra" x={x0 + 0.5} y={top} width={Math.max(0, x1 - x0 - 1)} height={h} fill="none" stroke={s.color} strokeWidth={1.4} opacity={0.9} style={{ transition: 'y 260ms var(--ease), height 260ms var(--ease)', ['--retraso' as string]: `${Math.min(i, 40) * 12}ms` }} />
              }
              return <rect key={i} className="entra-barra" x={x0 + 0.5} y={top} width={Math.max(0, x1 - x0 - 1)} height={h} fill={s.color} opacity={0.55} style={{ transition: 'y 260ms var(--ease), height 260ms var(--ease)', ['--retraso' as string]: `${Math.min(i, 40) * 12}ms` }} />
            })}
          </g>
        ))}

        {marks.map((m, idx) => (
          <g key={m.label}>
            <line x1={sx(m.value)} x2={sx(m.value)} y1={M.top} y2={M.top + ih} stroke={m.color} strokeDasharray="5 4" strokeWidth={1.6} />
            <text x={Math.min(w - M.right - 4, sx(m.value) + 5)} y={M.top + 13 + idx * 14} fontSize={11} fill={m.color} fontWeight={600}>{m.label}</text>
          </g>
        ))}

        {hover !== null && (
          <rect x={sx(edges[hover])} y={M.top} width={Math.max(0, sx(edges[hover + 1]) - sx(edges[hover]))} height={ih} fill="var(--ink)" opacity={0.07} pointerEvents="none" />
        )}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute rounded-md border px-3 py-2 text-xs shadow-sm"
          style={{ left: Math.min(Math.max(sx(edges[hover]) + 14, 8), w - 210), top: 8, background: 'var(--paper)', borderColor: 'var(--rule)', color: 'var(--ink)' }}>
          <div style={{ color: 'var(--muted)' }}>
            {edges[hover + 1] - edges[hover] === 1 && edges[hover + 1] <= 11
              ? `${xLabel} = ${fmt(edges[hover], 0)}`
              : `${xLabel}: de ${fmt(edges[hover], 0)} a ${fmt(edges[hover + 1], 0)}`}
          </div>
          {series.map((s) => (
            <div key={s.id} style={{ color: s.color === 'var(--serie-3)' ? 'var(--ink-2)' : s.color }}>
              {s.label}: {fmtInt(s.counts[hover])} ({fmtPct(totals[s.id] ? s.counts[hover] / totals[s.id] : 0)})
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function Legend({ items }: { items: { label: string; color: string; outline?: boolean; dash?: boolean }[] }) {
  return (
    <ul className="small flex flex-wrap gap-x-5 gap-y-1">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-2">
          <svg width="22" height="12" aria-hidden>
            {i.dash
              ? <line x1="0" x2="22" y1="6" y2="6" stroke={i.color} strokeWidth="2.5" strokeDasharray="4 3" />
              : <rect x="1" y="1" width="20" height="10" rx="2" fill={i.outline ? 'none' : i.color} fillOpacity={i.outline ? 0 : 0.55} stroke={i.color} strokeWidth="1.6" />}
          </svg>
          {i.label}
        </li>
      ))}
    </ul>
  )
}
