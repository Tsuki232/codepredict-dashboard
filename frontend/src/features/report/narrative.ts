/**
 * Texto del informe: se arma SOLO con los números que hay en pantalla, así que cambia cuando cambian las reglas.
 * No saca conclusiones por el grupo: describe lo que dicen los resultados y deja marcado lo que es decisión humana.
 */
import { fmt, fmtInt, fmtP, fmtPct } from '../../lib/format'
import type { AdaTest, InferenceResult, OutlierPolicy, PathPolicy, Preview, Profile, Rules } from '../../state/types'

export const PATH_TEXT: Record<PathPolicy, string> = {
  keep_first: 'se deja la primera aparición de cada ruta repetida',
  drop_all: 'se quitan todas las filas de las rutas repetidas',
  keep_all: 'se conservan todas las rutas repetidas',
}
export const OUTLIER_TEXT: Record<OutlierPolicy, string> = {
  keep: 'los atípicos extremos se conservan (solo se señalan)',
  tukey3: 'se quitan los atípicos extremos (más allá de Q3 + 3·RIC)',
  p999: 'se quitan los atípicos por encima del percentil 99,9',
}
export const ALT_H0 = {
  'two-sided': { h0: 'μ₁ = μ₂', h1: 'μ₁ ≠ μ₂' },
  greater: { h0: 'μ₁ ≤ μ₂', h1: 'μ₁ > μ₂' },
  less: { h0: 'μ₁ ≥ μ₂', h1: 'μ₁ < μ₂' },
} as const

export interface NarrativeInput {
  profile: Pick<Profile, 'rows' | 'columns' | 'exact_duplicates' | 'rows_with_repeated_path' | 'paths_repeated' | 'constant_columns' | 'integrity'>
  preview: Pick<Preview, 'rows_in' | 'rows_out' | 'steps' | 'verified' | 'quick' | 'impact'>
  live: InferenceResult | null
  rules: Rules
}

export interface Narrative {
  datos: string
  limpieza: string
  decisiones: string
  tabla: string
  welch?: string
  sensibilidad?: string
  chi?: string
  proporciones?: string
  bayes?: string
  limites: string[]
}

const rejects = (t: AdaTest, alpha: number) => t.p_value < alpha

export function buildNarrative({ profile: p, preview: v, live, rules }: NarrativeInput): Narrative {
  const bad = p.integrity.faltantes + p.integrity.no_numericos + p.integrity.negativos + p.integrity.loc_menor_que_lloc + p.integrity.loc_no_positivo
  const datos = `El conjunto Unified Bug Dataset (nivel archivo) tiene ${fmtInt(p.rows)} filas y ${p.columns} columnas. Antes de limpiar se encontraron `
    + `${fmtInt(p.exact_duplicates)} copias exactas, ${fmtInt(p.rows_with_repeated_path)} filas que repiten una ruta (${fmtInt(p.paths_repeated)} rutas afectadas), `
    + `${fmtInt(bad)} filas con valores inválidos y ${p.constant_columns.length ? `una columna constante (${p.constant_columns.join(', ')})` : 'ninguna columna constante'}.`

  const checkable = v.steps.filter((s) => s.verified !== null).length
  const limpieza = `Con las reglas elegidas el conjunto pasa de ${fmtInt(v.rows_in)} a ${fmtInt(v.rows_out)} filas (se conserva el ${fmtPct(v.rows_in ? v.rows_out / v.rows_in : 0)}). `
    + (v.verified ? `Las ${checkable} comprobaciones de filas quitadas coinciden entre pandas y DuckDB.` : 'Atención: hay pasos cuyo conteo NO coincide entre pandas y DuckDB; no se debe usar este resultado.')

  const diffs = v.impact.map((r) => r.risk_diff)
  const lo = Math.min(...diffs), hi = Math.max(...diffs)
  const decisiones = `Decisiones provisionales (son del grupo): ${PATH_TEXT[rules.path_policy]}; ${OUTLIER_TEXT[rules.outlier_policy]}. `
    + (diffs.length ? `Al comparar las ${diffs.length} combinaciones posibles, la diferencia entre los dos grupos va de ${fmt(lo * 100, 1)} a ${fmt(hi * 100, 1)} puntos porcentuales`
      + (lo > 0 ? ' y es positiva en todas: cambia la magnitud, no el sentido.' : '; el signo cambia según la política, así que la conclusión depende de la decisión.') : '')

  const q = v.quick
  const tabla = `En la tabla 2×2, ${fmtPct(q.p_d_given_c)} de los archivos complejos (McCC > ${rules.mccc_threshold}) tienen al menos un bug, frente a ${fmtPct(q.p_d_given_nc)} de los demás: `
    + `una diferencia de ${fmt(q.risk_diff * 100, 1)} puntos porcentuales (razón de riesgos ${fmt(q.p_d_given_nc ? q.p_d_given_c / q.p_d_given_nc : NaN, 2)}).`

  const limites = [
    'Asociación, no causalidad: los archivos complejos suelen ser también más grandes y más antiguos.',
    'Alcance: solo código Java del Unified Bug Dataset; no se generaliza a otros lenguajes ni proyectos.',
    `Umbrales fijados antes de abrir los datos: complejo = McCC > ${rules.mccc_threshold}; defectuoso = bug > ${rules.bug_threshold}. Cambiarlos cambia las tablas.`,
    'Las decisiones de limpieza (rutas repetidas y atípicos) son provisionales y deben justificarse en el informe del grupo.',
  ]
  const out: Narrative = { datos, limpieza, decisiones, tabla, limites }
  if (!live) return out

  const a = live.meta.alpha
  const w = live.welch
  const hyp = ALT_H0[live.meta.alternative]
  out.welch = `Prueba t de Welch (grupo 1: archivos con bug, n = ${fmtInt(live.groups.defectuosos.n)}; grupo 2: sin bug, n = ${fmtInt(live.groups.sin_defecto.n)}). `
    + `Contraste H₀: ${hyp.h0} frente a H₁: ${hyp.h1}. t(${fmt(w.df, 1)}) = ${fmt(w.statistic, 2)}, p ${w.p_value === 0 ? '< 10⁻³⁰⁰' : '= ' + fmtP(w.p_value)}, `
    + `g de Hedges = ${fmt(w.effect_size?.value, 3)} (${w.effect_size?.interpretation}). La diferencia de medias de McCC es ${fmt(w.estimate, 2)} `
    + `(IC ${Math.round((w.ci?.level ?? 0.95) * 100)} %: ${fmt(w.ci?.low, 2)} a ${fmt(w.ci?.high, 2)}). Con α = ${String(a).replace('.', ',')}, ${rejects(w, a) ? 'se rechaza' : 'no se rechaza'} H₀.`

  const r3 = [live.welch, live.welch_log, live.robust]
  const all = r3.every((t) => rejects(t, a)), none = r3.every((t) => !rejects(t, a))
  out.sensibilidad = `Como McCC es muy asimétrica, se repitió la comparación con log(1 + McCC) y con un contraste por rangos (Mann-Whitney). `
    + (all ? 'Las tres comparaciones rechazan H₀' : none ? 'Ninguna de las tres rechaza H₀' : 'Las tres comparaciones NO coinciden entre sí: la conclusión depende del supuesto')
    + `. La probabilidad de superioridad es P(X>Y) = ${fmt(live.robust.effect_size?.value, 3)}: elegidos al azar, un archivo con bug es más complejo que uno sin bug el ${fmtPct(live.robust.effect_size?.value)} de las veces. `
    + `Con ${fmtInt(live.meta.rows)} filas casi cualquier diferencia resulta «significativa», por eso importa el tamaño del efecto.`

  const c = live.chi_square
  out.chi = `Prueba χ² de independencia entre «ser complejo» y «tener bug»: χ²(${c.df}) = ${fmt(c.statistic, 2)}, p ${c.p_value === 0 ? '< 10⁻³⁰⁰' : '= ' + fmtP(c.p_value)}, `
    + `V de Cramér = ${fmt(c.effect_size?.value, 3)} (${c.effect_size?.interpretation}). Con α = ${String(a).replace('.', ',')}, ${rejects(c, a) ? 'se rechaza' : 'no se rechaza'} la independencia.`

  const z = live.two_proportions
  out.proporciones = `Comparación de dos proporciones: P(bug | complejo) = ${fmtPct(live.probabilities.p_d_given_c, 2)} frente a P(bug | no complejo) = ${fmtPct(live.probabilities.p_d_given_nc, 2)}. `
    + `z = ${fmt(z.statistic, 2)}, p ${z.p_value === 0 ? '< 10⁻³⁰⁰' : '= ' + fmtP(z.p_value)}; razón de momios ${fmt(z.effect_size?.value, 2)}`
    + (z.ci ? `; diferencia de proporciones ${fmt(z.estimate, 3)} (IC ${Math.round(z.ci.level * 100)} %: ${fmt(z.ci.low, 3)} a ${fmt(z.ci.high, 3)}).` : '.')

  const b = live.bayes
  out.bayes = `Teorema de Bayes con los conteos de esta muestra: la probabilidad de bug pasa de P(D) = ${fmtPct(b.prior, 2)} a P(D | C) = ${fmtPct(b.posterior, 2)} al saber que el archivo es complejo `
    + `(${fmtInt(b.counts.DC)} de ${fmtInt(b.counts.C)} archivos complejos). Es una estimación de esta muestra, no una probabilidad poblacional.`

  limites.splice(0, 0, live.independence.note)
  return out
}
