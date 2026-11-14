/** Número con coma decimal y signo menos tipográfico (−): 27,03 · −0,50. */
export const fmt = (x: number | null | undefined, d = 2) => (x != null && Number.isFinite(x) ? x.toFixed(d).replace('.', ',').replace('-', '−') : '—')

/** Entero con separador de miles (espacio fino): 43 744. */
export const fmtInt = (x: number | null | undefined) =>
  x != null && Number.isFinite(x) ? Math.round(x).toLocaleString('es-CO').replace(/[.,]/g, ' ') : '—'

/** Porcentaje con coma decimal: 23,4 %. */
export const fmtPct = (x: number | null | undefined, d = 1) =>
  x != null && Number.isFinite(x) ? `${(x * 100).toFixed(d).replace('.', ',')} %` : '—'

const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' }
const sup = (s: string) => [...s].map((c) => SUP[c] ?? c).join('')

/** p-valor legible: 0,0123 · 1,57 × 10⁻¹⁴⁸ · «< 10⁻³⁰⁰» cuando el cálculo en doble precisión se queda en 0. */
export function fmtP(p: number | null | undefined): string {
  if (p == null || !Number.isFinite(p)) return '—'
  if (p === 0) return '< 10⁻³⁰⁰'
  if (p >= 0.001) return p.toFixed(p >= 0.1 ? 3 : 4).replace('.', ',')
  const [m, e] = p.toExponential(2).split('e')
  return `${m.replace('.', ',')} × 10${sup(String(parseInt(e, 10)))}`
}

/** Cifra general con cifras significativas: 26,36 · 0,0123 · 1 234. */
export function fmtSig(x: number | null | undefined, sig = 4): string {
  if (x == null || !Number.isFinite(x)) return '—'
  if (x === 0) return '0'
  const a = Math.abs(x)
  if (a >= 1e5 || a < 1e-3) return x.toExponential(sig - 1).replace('.', ',').replace('e', ' × 10^').replace(/\^([+-]?\d+)/, (_, e) => sup(String(parseInt(e, 10))))
  return Number(x.toPrecision(sig)).toString().replace('.', ',').replace('-', '−')
}
