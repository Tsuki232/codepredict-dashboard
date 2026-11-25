import { memo } from 'react'
import { fmt, fmtInt, fmtP, fmtPct } from '../../lib/format'
import { cubicOut, escalon } from '../../motion/tiempo'
import { SegmentedTabs } from '../../ui/SegmentedTabs'
import type { TWelch } from '../tstudent/tipos'
import type { TNeurona } from '../tstudent/tipos'
import { BarraH, COLOR_FUENTE, MarcoEscena, useK } from './marco'
import type { Pelicula } from './pelicula'
import { DUR, techo } from './svg'
import type { IaFuente, IaFuenteId, IaLenguaje, TIa, TTablero } from './tipos'

interface Base { p: Pelicula; i: number; n: number }
/** Qué fuente de código está resaltada en todas las gráficas de IA (null = ninguna). Se comparte entre las dos escenas. */
export interface Foco { foco: IaFuenteId | null; onFoco: (id: IaFuenteId | null) => void }
export type Leng = 'java' | 'python'
const OPCIONES = [{ value: 'java' as Leng, label: 'Java' }, { value: 'python' as Leng, label: 'Python' }]

const ODC: Record<string, string> = {
  Algorithm: 'Algoritmo', Checking: 'Verificación', Assignment: 'Asignación', Timing: 'Temporización', 'Function/Class/Object': 'Función, clase u objeto',
  Interface: 'Interfaz', Build: 'Construcción', Documentation: 'Documentación',
}
const COLORES_ODC = ['var(--serie-1)', 'var(--serie-2)', 'var(--serie-4)', 'var(--serie-5)', 'var(--warn)', 'var(--serie-3)']

const atenua = (foco: IaFuenteId | null, id: IaFuenteId): React.CSSProperties => ({ opacity: foco && foco !== id ? 0.3 : 1 })
const alternar = (foco: IaFuenteId | null, id: IaFuenteId, onFoco: (v: IaFuenteId | null) => void) => onFoco(foco === id ? null : id)

function Pendiente({ p, i, n, id, titulo }: Base & { id: string; titulo: string }) {
  const { ref, repetir } = useK(p, i, 1000)
  return (
    <MarcoEscena p={p} i={i} n={n} id={id} titulo={titulo} repetir={repetir} refEscena={ref}>
      <p className="small">No se pudieron cargar los datos de IA: revisa que el servidor del panel esté corriendo (se necesita backend/app/datos/ia_cotroneo2025.json).</p>
    </MarcoEscena>
  )
}

function Selector({ leng, onLeng, l, foco, onFoco }: { leng: Leng; onLeng: (v: Leng) => void; l: IaLenguaje } & Foco) {
  const f = foco ? l.fuentes.find((x) => x.id === foco) : null
  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2">
      <SegmentedTabs options={OPCIONES} value={leng} onChange={onLeng} label="Lenguaje de programación" />
      <p className="small">{fmtInt(l.muestras)} funciones · {fmtInt(l.repositorios)} repositorios de GitHub · alertas de defectos con <b>{l.herramienta_defectos}</b>, de seguridad con <b>{l.herramienta_seguridad}</b></p>
      <p className="small w-full" style={{ color: 'var(--muted)' }}>
        {f
          ? <>Resaltando <b style={{ color: 'var(--ink)' }}>{nombreCorto(f)}</b> en todas las gráficas. <button type="button" className="enlace" onClick={() => onFoco(null)}>Quitar resaltado</button></>
          : 'Toca el nombre de una fuente para resaltarla en todas las gráficas.'}
      </p>
    </div>
  )
}

const nombreCorto = (f: IaFuente) => f.nombre.replace(' (gpt-3.5-turbo)', '').replace(' (GitHub)', '')

/** El nombre de una fuente, con su color: es el botón que la resalta (accesible con teclado; la fila entera también responde al clic). */
function NombreFuente({ f, foco, onFoco }: { f: IaFuente } & Foco) {
  return (
    <button type="button" className="fuente-btn" aria-pressed={foco === f.id} onClick={(e) => { e.stopPropagation(); alternar(foco, f.id, onFoco) }}>
      <span className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: COLOR_FUENTE[f.id] }} aria-hidden />{nombreCorto(f)}
    </button>
  )
}

/** Un bloque de barras: una fila por fuente, con la tasa, su intervalo de confianza y cuántas veces la tasa de las personas. */
function Bloque({ titulo, ayuda, fuentes, clave, k, desde, foco, onFoco }: { titulo: string; ayuda: string; fuentes: IaFuente[]; clave: 'defectos' | 'vulnerabilidades'; k: number; desde: number } & Foco) {
  const tope = techo(Math.max(...fuentes.map((f) => f[clave].ic95[1])))
  return (
    <div>
      <p className="font-semibold">{titulo}</p>
      <p className="small mb-3">{ayuda}</p>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {fuentes.map((f, j) => {
          const e = cubicOut(escalon(k, j, fuentes.length, 0.5, desde, desde + 0.45))
          const t = f[clave]
          const vs = f.vs_personas?.[clave]
          return (
            <li key={f.id} className="fila-foco grid items-center gap-x-3 gap-y-1 sm:grid-cols-[10.5rem_minmax(0,1fr)_11.5rem]" style={atenua(foco, f.id)} onClick={() => alternar(foco, f.id, onFoco)}>
              <NombreFuente f={f} foco={foco} onFoco={onFoco} />
              <div className="relative">
                <BarraH frac={t.tasa / tope} k={e} suave={k >= 1} color={COLOR_FUENTE[f.id]} alto={18} titulo={`${f.nombre}: ${fmtPct(t.tasa)} (IC 95 %: ${fmtPct(t.ic95[0])} a ${fmtPct(t.ic95[1])})`} />
                <div className="pointer-events-none absolute top-1/2 h-[2px] -translate-y-1/2" style={{ left: `${(t.ic95[0] / tope) * 100 * e}%`, width: `${((t.ic95[1] - t.ic95[0]) / tope) * 100 * e}%`, minWidth: 2, background: 'var(--ink)', transition: k >= 1 ? 'left 600ms var(--ease-out), width 600ms var(--ease-out)' : undefined }} aria-hidden />
              </div>
              <span className="text-[0.9375rem]" style={{ opacity: 0.3 + 0.7 * e }}>
                <b>{fmtPct(t.tasa * e)}</b>{' '}
                <span className="small">{vs ? `· ${fmt(vs.razon, 2)}× las personas` : '· referencia'}</span>
              </span>
            </li>
          )
        })}
      </ul>
      <p className="label mt-1.5 text-right">escala: 0 – {fmtPct(tope, 0)} · la línea negra es el intervalo de confianza del 95 %</p>
    </div>
  )
}

// ───────────────────────────────────────────────────────────── 9 · IA frente a personas: alertas

export const IaTasas = memo(function IaTasas({ p, i, n, ia, leng, onLeng, foco, onFoco }: Base & Foco & { ia: TIa | null; leng: Leng; onLeng: (v: Leng) => void }) {
  const { k, ref, repetir } = useK(p, i, DUR.iaTasas)
  if (!ia) return <Pendiente p={p} i={i} n={n} id="ia-tasas" titulo="Código de personas frente a código de IA" />
  const l = ia.lenguajes[leng]
  const texto = (m: string) => l.lectura.find((x) => x.metrica === m)?.texto
  return (
    <MarcoEscena p={p} i={i} n={n} id="ia-tasas" titulo="Código de personas frente a código generado por IA: alertas"
      nota="Misma función escrita por personas (GitHub) y por tres modelos. Se cuenta cuántas funciones disparan alertas de análisis estático; no son bugs reportados, y las dos herramientas (PMD, Pylint) tienen reglas distintas, así que solo se compara dentro de cada lenguaje." repetir={repetir} refEscena={ref}
      pie={<ul className="m-0 list-disc pl-5"><li>{texto('defectos')}</li><li>{texto('vulnerabilidades')}</li><li><i>Menos alertas no significa código correcto</i>: las funciones de IA son más cortas y la herramienta solo ve patrones, no si el programa hace lo que debe.</li></ul>}
      datos={{ cabeza: ['Fuente', 'Funciones con alertas de defectos', 'Tasa', 'IC 95 %', 'Funciones con alertas de seguridad', 'Tasa', 'IC 95 %'], filas: l.fuentes.map((f) => [f.nombre, fmtInt(f.defectos.k), fmtPct(f.defectos.tasa, 2), `${fmtPct(f.defectos.ic95[0], 2)} – ${fmtPct(f.defectos.ic95[1], 2)}`, fmtInt(f.vulnerabilidades.k), fmtPct(f.vulnerabilidades.tasa, 2), `${fmtPct(f.vulnerabilidades.ic95[0], 2)} – ${fmtPct(f.vulnerabilidades.ic95[1], 2)}`]) }}>
      <Selector leng={leng} onLeng={onLeng} l={l} foco={foco} onFoco={onFoco} />
      <div className="grid gap-8">
        <Bloque titulo={`Funciones con alertas de defectos (${l.herramienta_defectos})`} ayuda="Porcentaje de las funciones con al menos una alerta." fuentes={l.fuentes} clave="defectos" k={k} desde={0.05} foco={foco} onFoco={onFoco} />
        <Bloque titulo={`Funciones con alertas de seguridad (${l.herramienta_seguridad})`} ayuda="Porcentaje de las funciones con al menos una alerta de vulnerabilidad (CWE)." fuentes={l.fuentes} clave="vulnerabilidades" k={k} desde={0.4} foco={foco} onFoco={onFoco} />
      </div>
    </MarcoEscena>
  )
})

// ───────────────────────────────────────────────────────────── 10 · IA frente a personas: complejidad y tipos de defecto

export const IaDetalle = memo(function IaDetalle({ p, i, n, ia, leng, onLeng, foco, onFoco }: Base & Foco & { ia: TIa | null; leng: Leng; onLeng: (v: Leng) => void }) {
  const { k, ref, repetir } = useK(p, i, DUR.iaDetalle)
  if (!ia) return <Pendiente p={p} i={i} n={n} id="ia-detalle" titulo="Complejidad y tipos de defecto" />
  const l = ia.lenguajes[leng]
  const topeCcn = techo(Math.max(...l.fuentes.map((f) => f.complejidad.CCN.media)))
  const topeNloc = techo(Math.max(...l.fuentes.map((f) => f.complejidad.NLOC.media)))
  const tipos = l.odc_tipos
  const suave = k >= 1
  return (
    <MarcoEscena p={p} i={i} n={n} id="ia-detalle" ancha titulo="Complejidad de las funciones y tipos de defecto"
      nota="CCN es la complejidad ciclomática de cada función (cuántos caminos distintos tiene) y NLOC sus líneas de código sin comentarios. Los tipos de defecto siguen la clasificación ODC (Orthogonal Defect Classification)." repetir={repetir} refEscena={ref}
      pie={<><ul className="m-0 list-disc pl-5"><li>{l.lectura.find((x) => x.metrica === 'complejidad')?.texto}</li>
        <li>d de Cohen: la diferencia de CCN medida en desviaciones estándar combinadas; el signo negativo significa menos complejidad que las personas. Como la CCN tiene cola larga hacia arriba, es una medida orientativa y no una prueba.</li></ul></>}
      datos={{ cabeza: ['Fuente', 'Funciones', 'CCN media', 'CCN desv.', 'NLOC medio', 'd de Cohen (CCN)', ...tipos.map((t) => `${ODC[t] ?? t} (%)`)], filas: l.fuentes.map((f) => [f.nombre, fmtInt(f.complejidad.funciones), fmt(f.complejidad.CCN.media, 2), fmt(f.complejidad.CCN.sd, 2), fmt(f.complejidad.NLOC.media, 2), f.vs_personas ? fmt(f.vs_personas.ccn.d_cohen, 2) : '—', ...tipos.map((t) => fmtPct(f.odc.find((o) => o.tipo === t)?.parte ?? 0))]) }}>
      <Selector leng={leng} onLeng={onLeng} l={l} foco={foco} onFoco={onFoco} />
      <div className="grid gap-8 @3xl:grid-cols-2">
        <div>
          <p className="font-semibold">Complejidad ciclomática media por función (CCN)</p>
          <p className="small mb-3">Más alto = funciones con más caminos de ejecución.</p>
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {l.fuentes.map((f, j) => {
              const e = cubicOut(escalon(k, j, l.fuentes.length, 0.5, 0.04, 0.5))
              const c = f.complejidad.CCN
              return (
                <li key={f.id} className="fila-foco grid items-center gap-x-3 gap-y-1 sm:grid-cols-[9.75rem_minmax(0,1fr)_8.5rem]" style={atenua(foco, f.id)} onClick={() => alternar(foco, f.id, onFoco)}>
                  <NombreFuente f={f} foco={foco} onFoco={onFoco} />
                  <BarraH frac={c.media / topeCcn} k={e} suave={suave} color={COLOR_FUENTE[f.id]} alto={18} titulo={`${f.nombre}: CCN media ${fmt(c.media, 2)} (desviación ${fmt(c.sd, 2)})`} />
                  <span className="text-[0.9375rem]" style={{ opacity: 0.3 + 0.7 * e }}><b>{fmt(c.media * e, 2)}</b> <span className="small">{f.vs_personas ? `· d = ${fmt(f.vs_personas.ccn.d_cohen, 2)}` : '· referencia'}</span></span>
                </li>
              )
            })}
          </ul>
          <p className="font-semibold mt-6">Líneas de código por función (NLOC)</p>
          <ul className="m-0 mt-2 flex list-none flex-col gap-2.5 p-0">
            {l.fuentes.map((f, j) => {
              const e = cubicOut(escalon(k, j, l.fuentes.length, 0.5, 0.2, 0.62))
              const c = f.complejidad.NLOC
              return (
                <li key={f.id} className="fila-foco grid items-center gap-x-3 gap-y-1 sm:grid-cols-[9.75rem_minmax(0,1fr)_8.5rem]" style={atenua(foco, f.id)} onClick={() => alternar(foco, f.id, onFoco)}>
                  <span className="text-[0.9375rem]">{nombreCorto(f)}</span>
                  <BarraH frac={c.media / topeNloc} k={e} suave={suave} color={COLOR_FUENTE[f.id]} alto={12} rayas titulo={`${f.nombre}: ${fmt(c.media, 1)} líneas por función`} />
                  <span className="text-[0.9375rem]" style={{ opacity: 0.3 + 0.7 * e }}><b>{fmt(c.media * e, 1)}</b> <span className="small">líneas</span></span>
                </li>
              )
            })}
          </ul>
        </div>
        <div>
          <p className="font-semibold">¿Qué tipo de defecto señalan las alertas?</p>
          <p className="small mb-3">Reparto de las alertas de cada fuente por tipo ODC (cada barra suma 100 %).</p>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {l.fuentes.map((f, j) => {
              const e = cubicOut(escalon(k, j, l.fuentes.length, 0.5, 0.3, 0.8))
              return (
                <li key={f.id} className="fila-foco" style={atenua(foco, f.id)} onClick={() => alternar(foco, f.id, onFoco)}>
                  <p className="small mb-1" style={{ color: 'var(--ink)' }}>{nombreCorto(f)} <span style={{ color: 'var(--muted)' }}>· {fmtInt(f.defectos.alertas)} alertas</span></p>
                  <div className="barra-pista" style={{ height: 28 }}>
                    <div style={{ display: 'flex', height: '100%', transform: `scaleX(${e})`, transformOrigin: 'left' }}>
                      {tipos.map((t, m) => {
                        const parte = f.odc.find((o) => o.tipo === t)?.parte ?? 0
                        return (
                          <div key={t} title={`${ODC[t] ?? t}: ${fmtPct(parte)}`} style={{ width: `${parte * 100}%`, background: COLORES_ODC[m % COLORES_ODC.length], display: 'grid', placeItems: 'center', color: 'var(--on-accent)', fontSize: '0.75rem', fontWeight: 700, overflow: 'hidden', borderRight: '1px solid var(--paper)', transition: suave ? 'width 600ms var(--ease-out)' : undefined }}>
                            {parte >= 0.09 ? fmtPct(parte, 0) : ''}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
          <ul className="m-0 mt-4 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-[0.8125rem]" aria-label="Tipos de defecto">
            {tipos.map((t, m) => <li key={t}><span className="mr-1.5 inline-block h-3 w-3 rounded-sm align-middle" style={{ background: COLORES_ODC[m % COLORES_ODC.length] }} aria-hidden />{ODC[t] ?? t}</li>)}
          </ul>
        </div>
      </div>
    </MarcoEscena>
  )
})

// ───────────────────────────────────────────────────────────── 11 · cierre: lo que sí y lo que no se puede decir

export const Cierre = memo(function Cierre({ p, i, n, tab, w, neu, ia }: Base & { tab: TTablero | null; w: TWelch | null; neu: TNeurona | null; ia: TIa | null }) {
  const { k, ref, repetir } = useK(p, i, DUR.cierre)
  const si: string[] = []
  const no: string[] = []
  if (tab && w) {
    const r = tab.riesgo
    si.push(`Con los ${fmtInt(tab.kpis.filas)} archivos del proyecto, los que tienen bug son más complejos: McCC media ${fmt(tab.cajas.con_bug.media, 1)} frente a ${fmt(tab.cajas.sin_bug.media, 1)} (t de Welch = ${fmt(w.t, 1)}, ${w.p === 0 ? 'p < 10⁻³⁰⁰' : `p = ${fmtP(w.p)}`}; la permutación lo confirma sin fórmulas). La diferencia es pequeña a moderada (${w.efecto.nombre} = ${fmt(w.efecto.valor, 2)}).`)
    si.push(`El riesgo sube con la complejidad: ${fmtPct(r[0].tasa)} de archivos con bug en el tramo «${r[0].tramo}» y ${fmtPct(r[r.length - 1].tasa)} en «${r[r.length - 1].tramo}». «Compleja» y «con bug» son sucesos dependientes: P(bug | compleja) = ${fmtPct(tab.tabla.p_d_dado_c)} frente a P(bug) = ${fmtPct(tab.tabla.p_d)}.`)
    no.push('Que la complejidad cause los bugs: es una asociación observada en datos, no un experimento. El tamaño del archivo (LOC) y la complejidad están muy ligados.')
    if (neu?.umbral && neu.regla_trivial) no.push(`Que una sola variable baste para predecir: el AUC de ${fmt(neu.auc_prueba, 2)} es modesto y, con umbral 0,5, la neurona acierta ${fmt(neu.umbral.exactitud * 100, 1)} % frente a ${fmt(neu.regla_trivial.exactitud * 100, 1)} % de la regla trivial.`)
  }
  if (ia) {
    for (const l of Object.values(ia.lenguajes)) {
      const mod = l.fuentes.filter((f) => !f.es_persona)
      const menos = mod.filter((f) => f.vs_personas && f.vs_personas.defectos.dif_pp < 0).length
      const simple = mod.filter((f) => f.vs_personas && f.vs_personas.ccn.dif < 0).length
      si.push(`${l.nombre}: ${menos} de ${mod.length} modelos tuvieron menos funciones con alertas de defectos que las personas y ${simple} de ${mod.length} escribieron funciones menos complejas (CCN media).`)
    }
    no.push(...ia.limites.slice(0, 4))
  }
  const filas = [{ t: 'Lo que sí podemos decir', c: si, color: 'var(--ok)' }, { t: 'Lo que no podemos decir', c: no, color: 'var(--serie-2)' }]
  let c = 0
  const total = si.length + no.length
  return (
    <MarcoEscena p={p} i={i} n={n} id="cierre" ancha titulo="Conclusiones y límites" nota="Cada frase sale de las cifras de este tablero; los límites son parte del resultado." repetir={repetir} refEscena={ref}
      pie={<>Fuentes: Ferenc, R., Tóth, Z., Ladányi, G., Siket, I., y Gyimóthy, T. (2020). <i>Unified Bug Dataset</i> (v1.2). Zenodo. doi:10.5281/zenodo.3693686 (CC BY 4.0).{ia && <> {ia.meta.cita} Zenodo doi:{ia.meta.zenodo} ({ia.meta.licencia}).</>}</>}>
      <div className="grid gap-8 @3xl:grid-cols-2">
        {filas.map((f) => (
          <div key={f.t}>
            <p className="mb-3 font-semibold" style={{ color: f.color }}>{f.t}</p>
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {f.c.map((txt) => {
                const e = cubicOut(escalon(k, c++, Math.max(1, total), 0.3, 0.05, 0.85))
                return <li key={txt} className="rule-t pt-2 text-[0.9375rem]" style={{ opacity: e, transform: `translateY(${(1 - e) * 12}px)`, color: 'var(--ink)' }}>{txt}</li>
              })}
            </ul>
          </div>
        ))}
      </div>
      {!tab && <p className="small mt-4">Las conclusiones sobre los datos del proyecto aparecen cuando hay un conjunto limpio guardado.</p>}
    </MarcoEscena>
  )
})
