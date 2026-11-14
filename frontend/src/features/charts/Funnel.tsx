import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { fmt, fmtInt } from '../../lib/format'
import type { Step } from '../../state/types'
import { Verified } from '../../ui/Verified'

const LABELS: Record<string, string> = {
  faltantes: 'Con algún dato faltante', negativos: 'Con algún valor negativo', loc_menor_que_lloc: 'LOC menor que LLOC', loc_no_positivo: 'LOC ≤ 0',
  filas_en_rutas_repetidas: 'Filas que comparten ruta', rutas_repetidas: 'Rutas que se repiten', veces_max: 'Veces máximas que aparece una ruta',
  umbral_mccc: 'Umbral para McCC', umbral_loc: 'Umbral para LOC', por_columna: 'Filas por encima del umbral, por columna',
  se_quitarian_tukey3: 'Se quitarían con Q3 + 3·RIC', se_quitarian_p999: 'Se quitarían con el percentil 99,9',
  umbral_tukey3_mccc: 'Umbral Q3 + 3·RIC para McCC', umbral_tukey3_loc: 'Umbral Q3 + 3·RIC para LOC',
  defectuosos: 'Archivos defectuosos', complejas: 'Archivos complejos', sql_removed: 'Filas quitadas según DuckDB',
  columnas: 'Columnas', columnas_leidas: 'Columnas',
}
const HIDDEN = new Set(['politica'])

function show(v: unknown): string {
  if (v == null) return '—'
  if (typeof v === 'number') return Number.isInteger(v) ? fmtInt(v) : fmt(v, 1)
  if (Array.isArray(v)) return v.length ? v.join(', ') : 'ninguna'
  if (typeof v === 'object') {
    const e = Object.entries(v as Record<string, unknown>)
    return e.length ? e.map(([k, x]) => `${k}: ${show(x)}`).join(' · ') : 'ninguna'
  }
  return String(v)
}

/**
 * Embudo de limpieza: una barra por regla con las filas que sobreviven (azul) y las que se quitan (rojo).
 * Cada paso se abre para ver sus conteos y con qué dos métodos se comprobó.
 */
export function Funnel({ steps, total }: { steps: Step[]; total: number }) {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <ol className="flex flex-col" aria-label="Pasos de la limpieza">
      {steps.map((s, i) => {
        const keep = total ? (s.after / total) * 100 : 0
        const lost = total ? (s.removed / total) * 100 : 0
        const isOpen = open === s.id
        const details = Object.entries(s.detail).filter(([k]) => !HIDDEN.has(k))
        return (
          <li key={s.id} className={i ? 'border-t' : ''} style={{ borderColor: 'var(--rule)' }}>
            <button type="button" className="flex w-full flex-col gap-2 py-3 text-left" aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : s.id)}>
              <span className="flex items-start justify-between gap-3">
                <span className="text-[0.9375rem]"><span className="label mr-2">{i}</span>{s.label}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <Verified ok={s.verified} label={s.verified ? 'pandas = DuckDB' : 'No coincide'} methods={s.methods} />
                  <ChevronDown size={16} aria-hidden style={{ transform: isOpen ? 'rotate(180deg)' : undefined, transition: 'transform var(--t) var(--ease)' }} />
                </span>
              </span>
              <span className="flex items-center gap-3">
                <span className="relative h-[10px] flex-1 overflow-hidden rounded-full" style={{ background: 'var(--grid)' }} aria-hidden>
                  <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${keep}%`, background: 'var(--serie-1)', transition: 'width var(--t-slow) var(--ease)' }} />
                  {lost > 0 && <span className="absolute inset-y-0" style={{ left: `${keep}%`, width: `${Math.max(lost, 0.6)}%`, background: 'var(--serie-2)', transition: 'all var(--t-slow) var(--ease)' }} />}
                </span>
                <span className="w-[150px] shrink-0 sm:w-[210px] text-right text-[0.875rem] font-semibold tabular-nums">
                  {fmtInt(s.before)} → {fmtInt(s.after)}
                  {s.removed > 0 && <span style={{ color: 'var(--serie-2)' }}> (−{fmtInt(s.removed)})</span>}
                </span>
              </span>
            </button>
            {isOpen && (
              <div className="pb-4 pl-6">
                <dl className="readout">
                  {details.map(([k, v]) => (
                    <div key={k}><dt>{LABELS[k] ?? k}</dt><span className="dots" aria-hidden /><dd>{show(v)}</dd></div>
                  ))}
                </dl>
                <p className="small mt-3">Cómo se comprobó: {s.methods.join(' · ') || '—'}</p>
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}
