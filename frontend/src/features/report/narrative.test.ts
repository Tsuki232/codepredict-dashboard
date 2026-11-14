import { describe, expect, it } from 'vitest'
import type { InferenceResult, Rules } from '../../state/types'
import { buildNarrative, type NarrativeInput } from './narrative'

const rules: Rules = { integrity: true, drop_exact_duplicates: true, path_policy: 'keep_first', drop_constant_columns: true, outlier_policy: 'keep', mccc_threshold: 10, bug_threshold: 0 }

// Cifras de la tabla de 100 archivos de las pruebas del backend: C∩D=30, C∩¬D=20, ¬C∩D=10, ¬C∩¬D=40
const input = (over: Partial<NarrativeInput> = {}): NarrativeInput => ({
  profile: { rows: 100, columns: 11, exact_duplicates: 0, rows_with_repeated_path: 0, paths_repeated: 0, constant_columns: ['CLOC'],
    integrity: { faltantes: 0, negativos: 0, loc_menor_que_lloc: 0, loc_no_positivo: 0, no_numericos: 0 } },
  preview: { rows_in: 100, rows_out: 100, verified: true, steps: [{ id: 'a', label: '', before: 100, after: 100, removed: 0, detail: {}, verified: true, methods: [] }],
    quick: { n: 100, table: { C_D: 30, C_ND: 20, NC_D: 10, NC_ND: 40 }, p_d_given_c: 0.6, p_d_given_nc: 0.2, risk_diff: 0.4, mean_mccc_bug: 15.5, mean_mccc_ok: 8 },
    impact: [
      { path_policy: 'keep_first', outlier_policy: 'keep', selected: true, n: 100, table: { C_D: 30, C_ND: 20, NC_D: 10, NC_ND: 40 }, p_d_given_c: 0.6, p_d_given_nc: 0.2, risk_diff: 0.4, mean_mccc_bug: 1, mean_mccc_ok: 1 },
      { path_policy: 'drop_all', outlier_policy: 'keep', selected: false, n: 90, table: { C_D: 20, C_ND: 20, NC_D: 10, NC_ND: 40 }, p_d_given_c: 0.5, p_d_given_nc: 0.2, risk_diff: 0.3, mean_mccc_bug: 1, mean_mccc_ok: 1 },
    ] },
  live: null, rules, ...over,
})

const test = (p: number) => ({ test: 't', statistic: 4.5, df: 78.1, p_value: p, estimate: 7.5, effect_size: { name: 'g', value: 0.9, interpretation: 'grande' },
  ci: { level: 0.95, of: '', low: 4, high: 11 }, decision: '', verified: true, verification_methods: [] })

const live = (p: number): InferenceResult => ({
  meta: { alpha: 0.05, alternative: 'two-sided', rows: 100, sha256: null, created_utc: '', rules, ada: { phase: 'ready', ready: true, error: null, load_seconds: 1, root: '' }, source: 'vista en vivo' },
  groups: { defectuosos: { n: 40, mean: 15.5, sd: 8, median: 20, q1: 2, q3: 20, max: 20 }, sin_defecto: { n: 60, mean: 8, sd: 9, median: 2, q1: 2, q3: 20, max: 20 } },
  table2x2: { C_D: 30, C_ND: 20, NC_D: 10, NC_ND: 40 },
  probabilities: { p_d: 0.4, p_c: 0.5, p_d_given_c: 0.6, p_d_given_nc: 0.2, p_c_given_d: 0.75, risk_diff: 0.4, risk_ratio: 3 },
  welch: test(p), welch_log: test(p), robust: { ...test(p), effect_size: { name: 'prob', value: 0.7, interpretation: '' } },
  chi_square: { ...test(p), df: 1, statistic: 50 / 3 }, two_proportions: { ...test(p), estimate: 0.4 },
  bayes: { posterior: 0.6, prior: 0.4, p_C_given_D: 0.75, p_C_given_notD: 1 / 3, p_C: 0.5, formula: '', decision: '', counts: { DC: 30, C: 50 }, verified: true, verification_methods: [] },
  independence: { repeated_path_rows: 0, note: 'No quedan rutas repetidas.' }, hist: { edges: [1, 2], counts: {} },
})

describe('texto del informe', () => {
  it('describe los datos con las cifras reales', () => {
    const n = buildNarrative(input())
    expect(n.datos).toContain('100 filas y 11 columnas')
    expect(n.datos).toContain('una columna constante (CLOC)')
    expect(n.limpieza).toContain('de 100 a 100 filas')
    expect(n.limpieza).toContain('coinciden entre pandas y DuckDB')
  })
  it('la tabla 2×2 sale de los conteos (60 % frente a 20 %, 40 puntos, razón 3)', () => {
    const n = buildNarrative(input())
    expect(n.tabla).toContain('60,0 %')
    expect(n.tabla).toContain('20,0 %')
    expect(n.tabla).toContain('40,0 puntos porcentuales')
    expect(n.tabla).toContain('razón de riesgos 3,00')
  })
  it('las decisiones dicen el rango entre políticas y que cambia la magnitud, no el sentido', () => {
    const n = buildNarrative(input())
    expect(n.decisiones).toContain('de 30,0 a 40,0 puntos')
    expect(n.decisiones).toContain('cambia la magnitud, no el sentido')
  })
  it('si una política invierte el signo, lo dice', () => {
    const base = input()
    base.preview.impact[1] = { ...base.preview.impact[1], risk_diff: -0.05 }
    expect(buildNarrative(base).decisiones).toContain('el signo cambia según la política')
  })
  it('un conteo que no coincide entre pandas y DuckDB se advierte', () => {
    const base = input()
    base.preview.verified = false
    expect(buildNarrative(base).limpieza).toContain('NO coincide')
  })
  it('sin inferencia no hay secciones de resultados', () => {
    const n = buildNarrative(input())
    expect(n.welch).toBeUndefined()
    expect(n.limites.length).toBeGreaterThan(2)
  })
  it('con inferencia: rechaza H₀ cuando p < α y no cuando p ≥ α', () => {
    const rej = buildNarrative(input({ live: live(0.001) }))
    expect(rej.welch).toContain('se rechaza H₀')
    expect(rej.welch).toContain('H₀: μ₁ = μ₂')
    expect(rej.sensibilidad).toContain('Las tres comparaciones rechazan H₀')
    expect(rej.chi).toContain('χ²(1) = 16,67')
    expect(rej.bayes).toContain('P(D | C) = 60,00 %')
    const keep = buildNarrative(input({ live: live(0.2) }))
    expect(keep.welch).toContain('no se rechaza H₀')
    expect(keep.sensibilidad).toContain('Ninguna de las tres rechaza H₀')
  })
  it('la hipótesis alternativa unilateral cambia H₀', () => {
    const l = live(0.001)
    l.meta.alternative = 'greater'
    expect(buildNarrative(input({ live: l })).welch).toContain('H₀: μ₁ ≤ μ₂ frente a H₁: μ₁ > μ₂')
  })
  it('p = 0 se muestra como menor que 10⁻³⁰⁰, no como cero', () => {
    expect(buildNarrative(input({ live: live(0) })).welch).toContain('p < 10⁻³⁰⁰')
  })
})
