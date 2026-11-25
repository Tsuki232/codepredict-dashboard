import { fmtPct } from '../../lib/format'

/** Probabilidad de bug en general y sabiendo que el archivo es complejo (Bayes). */
export function Bars({ prior, posterior }: { prior: number; posterior: number }) {
  const row = (label: string, v: number, color: string) => (
    <div>
      <div className="small mb-1 flex justify-between"><span>{label}</span><span className="font-semibold" style={{ color: 'var(--ink)' }}>{fmtPct(v)}</span></div>
      <div className="h-[12px] overflow-hidden rounded-full" style={{ background: 'var(--grid)' }} aria-hidden>
        <div className="entra-x h-full rounded-full" style={{ width: `${v * 100}%`, background: color, transition: 'width var(--t-slow) var(--ease)' }} />
      </div>
    </div>
  )
  return (
    <div className="flex flex-col gap-3" role="img" aria-label={`Probabilidad de defecto: ${fmtPct(prior)} en general y ${fmtPct(posterior)} si el archivo es complejo`}>
      {row('P(D): cualquier archivo', prior, 'var(--serie-3)')}
      {row('P(D | C): sabiendo que es complejo', posterior, 'var(--serie-2)')}
    </div>
  )
}
