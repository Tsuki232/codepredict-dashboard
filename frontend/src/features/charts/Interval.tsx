import { fmt } from '../../lib/format'

/**
 * Estimación con su intervalo de confianza sobre una recta, con una línea de referencia (la hipótesis nula).
 * Si el intervalo no cruza la referencia, se ve de un vistazo.
 */
export function Interval({ label, estimate, low, high, reference, referenceLabel, color = 'var(--serie-1)', level = 0.95, decimals = 2 }: {
  label: string; estimate: number; low: number; high: number; reference: number; referenceLabel: string; color?: string; level?: number; decimals?: number
}) {
  const fmtSig = (v: number) => fmt(v, decimals)
  const lo = Math.min(low, reference), hi = Math.max(high, reference)
  const pad = (hi - lo) * 0.18 || 1
  const a = lo - pad, b = hi + pad
  const pos = (v: number) => `${((v - a) / (b - a)) * 100}%`
  const crosses = low <= reference && reference <= high
  return (
    <figure className="m-0" aria-label={`${label}: ${fmtSig(estimate)} con IC ${Math.round(level * 100)} % de ${fmtSig(low)} a ${fmtSig(high)}; ${crosses ? 'incluye' : 'no incluye'} ${referenceLabel}`}>
      <figcaption className="small mb-1 flex flex-wrap justify-between gap-2">
        <span>{label}</span>
        <span>{crosses ? `El intervalo incluye ${referenceLabel}` : `El intervalo no incluye ${referenceLabel}`}</span>
      </figcaption>
      <div className="relative h-9" aria-hidden>
        <div className="absolute inset-x-0 top-1/2 h-px" style={{ background: 'var(--grid-strong)' }} />
        <div className="absolute top-[3px] bottom-[3px] w-[2px]" style={{ left: pos(reference), background: 'var(--ink-2)', transform: 'translateX(-1px)' }} />
        <div className="absolute top-1/2 h-[6px] rounded-full" style={{ left: pos(low), width: `calc(${pos(high)} - ${pos(low)})`, minWidth: 3, background: color, opacity: 0.4, transform: 'translateY(-50%)' }} />
        <div className="absolute top-1/2 h-[14px] w-[14px] rounded-full border-2" style={{ left: pos(estimate), background: 'var(--paper)', borderColor: color, transform: 'translate(-50%, -50%)' }} />
      </div>
      <div className="relative h-4 text-[0.75rem]" aria-hidden>
        <span className="absolute whitespace-nowrap" style={{ left: pos(reference), transform: `translateX(${reference < (a + b) / 2 ? '-10%' : '-90%'})`, color: 'var(--ink-2)' }}>{referenceLabel}</span>
      </div>
      <p className="small mt-1" aria-hidden>
        Estimación <strong style={{ color: 'var(--ink)' }}>{fmtSig(estimate)}</strong> · IC {Math.round(level * 100)} %: {fmtSig(low)} a {fmtSig(high)}
      </p>
    </figure>
  )
}
