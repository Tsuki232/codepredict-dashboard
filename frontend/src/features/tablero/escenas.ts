import { fmt, fmtInt, fmtP, fmtPct } from '../../lib/format'
import type { TNeurona, TPermutacion, TWelch } from '../tstudent/tipos'
import type { EscenaDef } from './pelicula'
import { DUR } from './svg'
import type { TIa, TTablero } from './tipos'

export type EscenaId = 'portada' | 'embudo' | 'distribucion' | 'riesgo' | 'probabilidad' | 'welch' | 'permutacion' | 'neurona' | 'ia-tasas' | 'ia-detalle' | 'cierre'

export interface Datos { tab: TTablero | null; w: TWelch | null; perm: TPermutacion | null; neu: TNeurona | null; ia: TIa | null; leng: 'java' | 'python' }

const textoP = (p: number) => (p === 0 ? 'p < 10⁻³⁰⁰' : `p = ${fmtP(p)}`)

/**
 * Las escenas que hay que mostrar con los datos disponibles, en orden, cada una con su duración y su subtítulo.
 * Los subtítulos se escriben con las cifras reales; no hay números fijos en el texto.
 */
export function construirEscenas(d: Datos): (EscenaDef & { id: EscenaId })[] {
  const out: (EscenaDef & { id: EscenaId })[] = []
  const add = (id: EscenaId, titulo: string, ms: number, narracion: string) => out.push({ id, titulo, ms, narracion })
  const { tab, w, perm, neu, ia, leng } = d

  if (tab) {
    const { con_bug: con, sin_bug: sin } = tab.cajas
    const r = tab.riesgo
    const t = tab.tabla
    add('portada', 'La pregunta', DUR.portada, `¿Los archivos con errores son más complejos? Analizamos ${fmtInt(tab.kpis.filas)} archivos Java y calculamos todo en este equipo, con Python.`)
    add('embudo', 'La limpieza', DUR.embudo, `De ${fmtInt(tab.meta.filas_originales)} filas originales quedaron ${fmtInt(tab.kpis.filas)} archivos después de aplicar las reglas de limpieza, cada una con su conteo.`)
    add('distribucion', 'La complejidad', DUR.distribucion, `Mediana de complejidad: ${fmt(con.mediana, 0)} en los archivos con bug y ${fmt(sin.mediana, 0)} en los que no tienen; la media es ${fmt(con.media, 1)} frente a ${fmt(sin.media, 1)}.`)
    add('riesgo', 'El riesgo', DUR.riesgo, `El porcentaje de archivos con bug pasa de ${fmtPct(r[0].tasa)} en el tramo «${r[0].tramo}» a ${fmtPct(r[r.length - 1].tasa)} en «${r[r.length - 1].tramo}».`)
    add('probabilidad', 'Probabilidades', DUR.probabilidad, `P(bug | compleja) = ${fmtPct(t.p_d_dado_c)} frente a P(bug | no compleja) = ${fmtPct(t.p_d_dado_nc)}: son sucesos dependientes. Por Bayes, P(compleja | bug) = ${fmtPct(t.p_c_dado_d)}.`)
  }
  if (w) add('welch', 'Prueba t de Welch', DUR.welch, `La t de Welch vale ${fmt(w.t, 1)}: la diferencia de medias está a ${fmt(w.t, 1)} errores estándar de cero (${textoP(w.p)}).`)
  if (perm) add('permutacion', 'Permutación', DUR.permutacion, `Al barajar las etiquetas ${fmtInt(perm.repeticiones)} veces, ${perm.extremos === 0 ? 'ninguna t barajada' : `${fmtInt(perm.extremos)} de ${fmtInt(perm.repeticiones)}`} iguala a la t real de ${fmt(perm.t_obs, 1)}.`)
  if (neu) {
    const u = neu.umbral
    const tr = neu.regla_trivial
    add('neurona', 'Una neurona', DUR.neurona, `Una sola neurona logra un AUC de ${fmt(neu.auc_prueba, 2)}${u && tr ? `; con umbral 0,5 acierta ${fmt(u.exactitud * 100, 1)} % y la regla trivial ${fmt(tr.exactitud * 100, 1)} %: señal real, pero modesta` : ''}.`)
  }
  if (ia) {
    const l = ia.lenguajes[leng]
    add('ia-tasas', 'IA frente a personas', DUR.iaTasas, `${l.lectura.find((x) => x.metrica === 'defectos')?.texto ?? ''} Son alertas de análisis estático, no bugs reportados.`)
    add('ia-detalle', 'Complejidad y defectos', DUR.iaDetalle, l.lectura.find((x) => x.metrica === 'complejidad')?.texto ?? '')
  }
  add('cierre', 'Conclusiones', DUR.cierre, 'Asociación sí; causalidad no. Los límites de cada comparación son parte del resultado.')
  return out
}
