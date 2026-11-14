import { fmt, fmtInt, fmtPct } from '../../lib/format'
import type { Table2x2 as T } from '../../state/types'

/**
 * Tabla de contingencia 2×2 con totales y la proporción de defectuosos en cada fila.
 * El tono de cada celda es proporcional a su parte del total (más oscuro = más archivos).
 */
export function Table2x2({ t, expected, caption, cLabel = 'McCC > 10', ncLabel = 'McCC ≤ 10' }: {
  t: T; expected?: number[][]; caption: string; cLabel?: string; ncLabel?: string
}) {
  const n = t.C_D + t.C_ND + t.NC_D + t.NC_ND
  const rowC = t.C_D + t.C_ND, rowN = t.NC_D + t.NC_ND
  const colD = t.C_D + t.NC_D, colN = t.C_ND + t.NC_ND
  const cell = (v: number, e?: number) => (
    <td className="px-3 py-3 text-right" style={{ background: `color-mix(in srgb, var(--serie-1) ${Math.min(38, Math.round((n ? v / n : 0) * 70))}%, transparent)` }}>
      <span className="block text-[1.0625rem] font-semibold">{fmtInt(v)}</span>
      <span className="small block">{fmtPct(n ? v / n : 0)} del total</span>
      {e != null && <span className="small block">esperado {fmt(e, 1)}</span>}
    </td>
  )
  const th = 'px-3 py-2 text-left text-[0.8125rem] font-medium'
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[460px] border text-[0.9375rem]" style={{ borderColor: 'var(--rule)' }}>
        <caption className="small pb-2 text-left">{caption}</caption>
        <thead>
          <tr style={{ background: 'var(--grid)' }}>
            <th scope="col" className={th} />
            <th scope="col" className={`${th} text-right`}>Con bug (D)</th>
            <th scope="col" className={`${th} text-right`}>Sin bug (D̄)</th>
            <th scope="col" className={`${th} text-right`}>Total</th>
            <th scope="col" className={`${th} text-right`}>% con bug</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t" style={{ borderColor: 'var(--rule)' }}>
            <th scope="row" className={th}>{cLabel} <span className="label">(C)</span></th>
            {cell(t.C_D, expected?.[0][0])}{cell(t.C_ND, expected?.[0][1])}
            <td className="px-3 py-3 text-right font-semibold">{fmtInt(rowC)}</td>
            <td className="px-3 py-3 text-right font-semibold" style={{ color: 'var(--serie-2)' }}>{fmtPct(rowC ? t.C_D / rowC : 0)}</td>
          </tr>
          <tr className="border-t" style={{ borderColor: 'var(--rule)' }}>
            <th scope="row" className={th}>{ncLabel} <span className="label">(C̄)</span></th>
            {cell(t.NC_D, expected?.[1][0])}{cell(t.NC_ND, expected?.[1][1])}
            <td className="px-3 py-3 text-right font-semibold">{fmtInt(rowN)}</td>
            <td className="px-3 py-3 text-right font-semibold" style={{ color: 'var(--serie-2)' }}>{fmtPct(rowN ? t.NC_D / rowN : 0)}</td>
          </tr>
          <tr className="border-t font-semibold" style={{ borderColor: 'var(--rule)', background: 'var(--grid)' }}>
            <th scope="row" className={th}>Total</th>
            <td className="px-3 py-2 text-right">{fmtInt(colD)}</td>
            <td className="px-3 py-2 text-right">{fmtInt(colN)}</td>
            <td className="px-3 py-2 text-right">{fmtInt(n)}</td>
            <td className="px-3 py-2 text-right">{fmtPct(n ? colD / n : 0)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
