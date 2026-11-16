import { Download, FileDown, Loader } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Bars } from '../features/charts/Bars'
import { Interval } from '../features/charts/Interval'
import { Legend, LogHistogram, type VMark } from '../features/charts/LogHistogram'
import { Table2x2 } from '../features/charts/Table2x2'
import { ALT_H0, buildNarrative } from '../features/report/narrative'
import { downloadFromApi, saveBlob } from '../lib/api'
import { fmt, fmtInt, fmtP, fmtPct } from '../lib/format'
import { expectedOf } from '../lib/stats'
import { sameRules, useStore } from '../state/store'
import { engineName } from '../lib/engine'
import type { AdaTest } from '../state/types'
import { SegmentedTabs } from '../ui/SegmentedTabs'

const PATH_OPTS = [{ value: 'keep_first', label: 'Dejar la primera' }, { value: 'drop_all', label: 'Quitar todas' }, { value: 'keep_all', label: 'Conservar todas' }] as const
const OUT_OPTS = [{ value: 'keep', label: 'Conservar' }, { value: 'tukey3', label: 'Q3 + 3·RIC' }, { value: 'p999', label: 'Percentil 99,9' }] as const
const PATH_SHORT = { keep_first: 'Dejar la primera', drop_all: 'Quitar todas', keep_all: 'Conservar todas' } as const
const OUT_SHORT = { keep: 'Conservar', tukey3: 'Q3 + 3·RIC', p999: 'Percentil 99,9' } as const

function Sec({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return <section className="rep-sec"><h2>{n}. {title}</h2>{children}</section>
}

function Fig({ n, caption, children }: { n: number; caption: string; children: ReactNode }) {
  return <figure className="rep-fig"><div>{children}</div><figcaption><strong>Figura {n}.</strong> {caption}</figcaption></figure>
}

function Tab({ n, caption, children }: { n: number; caption: string; children: ReactNode }) {
  return <div className="rep-fig"><p className="rep-cap"><strong>Tabla {n}.</strong> {caption}</p>{children}</div>
}

const seal = (t: AdaTest) => `${t.verified ? '✓ verificado' : '✗ las vías no coinciden'}: ${t.verification_methods.join(' · ')}`

export function InformeView() {
  const profile = useStore((s) => s.profile)
  const preview = useStore((s) => s.preview)
  const previewBusy = useStore((s) => s.previewBusy)
  const live = useStore((s) => s.live)
  const liveBusy = useStore((s) => s.liveBusy)
  const liveError = useStore((s) => s.liveError)
  const rules = useStore((s) => s.rules)
  const patch = useStore((s) => s.patchRules)
  const alpha = useStore((s) => s.alpha)
  const alt = useStore((s) => s.alternative)
  const setAlpha = useStore((s) => s.setAlpha)
  const setAlt = useStore((s) => s.setAlternative)
  const refreshLive = useStore((s) => s.refreshLive)
  const applied = useStore((s) => s.applied)
  const ada = useStore((s) => s.health?.ada)
  const [mcccTab, setMcccTab] = useState<'McCC' | 'LOC'>('McCC')
  const [err, setErr] = useState<string | null>(null)
  const [stamp, setStamp] = useState<Date>(new Date())

  const adaReady = !!ada?.ready
  const motor = engineName(live?.meta.ada ?? ada)       // «Ada» o «Python local»: el informe nunca atribuye a Ada lo que calculó Python
  // El informe se recalcula solo: al cambiar reglas, α o la hipótesis se pide de nuevo la inferencia (agrupando cambios rápidos).
  useEffect(() => {
    if (!adaReady) return
    const id = setTimeout(() => void refreshLive(), 400)
    return () => clearTimeout(id)
  }, [rules, alpha, alt, adaReady, refreshLive])

  const previewFresh = !!preview && sameRules(preview.rules, rules) && !previewBusy
  const liveFresh = !!live && sameRules(live.meta.rules, rules) && live.meta.alpha === alpha && live.meta.alternative === alt && !liveBusy
  const ready = previewFresh && (liveFresh || !adaReady)
  useEffect(() => { if (ready) setStamp(new Date()) }, [ready, preview, live])

  const narrative = useMemo(() => (profile && preview && previewFresh ? buildNarrative({ profile, preview, live: liveFresh ? live : null, rules }) : null),
    [profile, preview, previewFresh, live, liveFresh, rules])

  if (!profile || !preview) return <p className="label py-24 text-center" role="status">Preparando el informe…</p>

  const today = stamp.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })
  const fileName = `CodePredict-informe-${stamp.toISOString().slice(0, 10)}`
  const printPdf = () => {
    // El nombre sugerido para guardar el PDF sale del título de la página.
    const old = document.title
    document.title = fileName
    const restore = () => { document.title = old; window.removeEventListener('afterprint', restore) }
    window.addEventListener('afterprint', restore)
    window.print()
  }
  const get = async (url: string, name: string) => { setErr(null); try { await downloadFromApi(url, name) } catch (e) { setErr((e as Error).message) } }

  let fig = 0, tab = 0
  const h = preview.hist[mcccTab]
  const fence = preview.fences[mcccTab]
  const marks: VMark[] = [{ value: fence.tukey3_upper, label: `Q3 + 3·RIC = ${fmt(fence.tukey3_upper, 0)}`, color: 'var(--serie-2)' }, { value: fence.p999_upper, label: `p99,9 = ${fmt(fence.p999_upper, 0)}`, color: 'var(--warn)' }]
  if (mcccTab === 'McCC') marks.push({ value: rules.mccc_threshold, label: `umbral > ${rules.mccc_threshold}`, color: 'var(--ink-2)' })
  const g = live?.groups

  return (
    <div className="flex flex-col gap-6">
      {/* ───── Controles (no se imprimen) ───── */}
      <div className="no-print panel" style={{ padding: 16 }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="h2">Informe en vivo</h2>
            <p className="small max-w-[60ch]">Cambia cualquier opción y el informe (texto, tablas y gráficas) se recalcula. Cuando diga «al día», descárgalo en PDF.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="chip" disabled={!ready} style={{ height: 40, paddingInline: 18, background: 'var(--ink)', color: 'var(--bg)', borderColor: 'var(--ink)' }} onClick={printPdf}
              title={ready ? 'Abre el diálogo de impresión: elige «Guardar como PDF»' : 'Espera a que el informe termine de actualizarse'}>
              <FileDown size={16} aria-hidden className="mr-2" /> Descargar PDF
            </button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
          <div><p className="label mb-1">Rutas repetidas</p><SegmentedTabs label="Rutas repetidas" value={rules.path_policy} onChange={(path_policy) => patch({ path_policy })} options={[...PATH_OPTS]} /></div>
          <div><p className="label mb-1">Atípicos extremos</p><SegmentedTabs label="Atípicos extremos" value={rules.outlier_policy} onChange={(outlier_policy) => patch({ outlier_policy })} options={[...OUT_OPTS]} /></div>
          <div><p className="label mb-1">α</p><SegmentedTabs label="Nivel de significancia" value={String(alpha)} onChange={(v) => setAlpha(Number(v))} options={[{ value: '0.1', label: '0,10' }, { value: '0.05', label: '0,05' }, { value: '0.01', label: '0,01' }]} /></div>
          <div><p className="label mb-1">Hipótesis alternativa de Welch</p><SegmentedTabs label="Hipótesis alternativa" value={alt} onChange={setAlt} options={[{ value: 'two-sided', label: '≠' }, { value: 'greater', label: 'Con bug mayor' }, { value: 'less', label: 'Con bug menor' }]} /></div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="small flex items-center gap-2" role="status">
            {ready ? <>● Informe al día · {stamp.toLocaleTimeString('es-CO')}</> : <><Loader size={14} className="nb-spin" aria-hidden /> Actualizando el informe…</>}
            {liveError && <span style={{ color: 'var(--bad)' }}> · {liveError}</span>}
            {!adaReady && <span> · Ada {ada?.phase === 'error' ? 'no está disponible' : 'se está cargando'}: sin inferencia en el informe</span>}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="label">Anexos:</span>
            <button type="button" className="chip" disabled={!applied} onClick={() => void get('/api/files/unified_file_limpio.csv', 'unified_file_limpio.csv')} title={applied ? 'CSV del último guardado' : 'Guarda la limpieza primero'}><Download size={14} aria-hidden /> <span className="ml-2">CSV limpio</span></button>
            <button type="button" className="chip" disabled={!applied} onClick={() => void get('/api/files/manifest.json', 'manifest.json')}><Download size={14} aria-hidden /> <span className="ml-2">Manifiesto</span></button>
            <button type="button" className="chip" disabled={!liveFresh || !live} onClick={() => live && saveBlob(new Blob([JSON.stringify(live, null, 2)], { type: 'application/json' }), `${fileName}-resultados.json`)}><Download size={14} aria-hidden /> <span className="ml-2">Resultados (JSON)</span></button>
          </div>
        </div>
        {err && <p className="small mt-2" style={{ color: 'var(--bad)' }} role="alert">{err}</p>}
        {applied && !sameRules(applied.rules, rules) && <p className="small mt-2" style={{ color: 'var(--warn)' }}>El CSV limpio guardado usa otras reglas que las de pantalla; el informe usa las de pantalla.</p>}
      </div>

      {/* ───── El informe ───── */}
      <article className="report" aria-label="Informe">
        <header className="rep-head">
          <p className="rep-kicker">Estadística Inferencial y Ciencia de Datos</p>
          <h1>CodePredict AI: limpieza de datos e inferencia sobre complejidad y defectos</h1>
          <p className="rep-meta">Informe generado automáticamente el {today} · Unified Bug Dataset v1.2, nivel archivo</p>
          <p className="rep-note"><strong>Borrador de apoyo.</strong> Las cifras las calculan scripts verificados (pandas, DuckDB y {motor === 'Ada' ? 'el motor Ada' : 'el motor estadístico local de Python, sin Ada'}); el texto describe lo que dicen. Las decisiones de limpieza y la interpretación final son del grupo.</p>
        </header>

        {!narrative ? <p className="label py-10" role="status">Recalculando con las nuevas opciones…</p> : (
          <>
            <Sec n={1} title="Datos">
              <p>{narrative.datos}</p>
              <p>Huella SHA-256 del CSV de entrada: <code>{profile.source.sha256.slice(0, 24)}…</code> (el archivo original no se modifica).</p>
            </Sec>

            <Sec n={2} title="Limpieza">
              <p>{narrative.limpieza}</p>
              <Tab n={++tab} caption="Pasos de la limpieza con las reglas elegidas. Cada conteo de filas quitadas se calculó con pandas y con una consulta DuckDB independiente.">
                <table className="rep-table">
                  <thead><tr><th>Paso</th><th>Antes</th><th>Después</th><th>Quitadas</th><th>Verificación</th></tr></thead>
                  <tbody>{preview.steps.map((s) => (
                    <tr key={s.id}><td>{s.label}</td><td>{fmtInt(s.before)}</td><td>{fmtInt(s.after)}</td><td>{s.removed ? `−${fmtInt(s.removed)}` : '0'}</td>
                      <td>{s.verified === null ? '—' : s.verified ? '✓ pandas = DuckDB' : '✗ no coincide'}</td></tr>
                  ))}</tbody>
                </table>
              </Tab>
              <Fig n={++fig} caption={`Distribución de ${mcccTab} antes (contorno) y después (barras) de limpiar, en escala logarítmica. Las líneas son umbrales posibles para atípicos.`}>
                <div className="no-print mb-2"><SegmentedTabs label="Variable" value={mcccTab} onChange={setMcccTab} options={[{ value: 'McCC', label: 'McCC' }, { value: 'LOC', label: 'LOC' }]} /></div>
                <Legend items={[{ label: 'Crudo', color: 'var(--serie-3)', outline: true }, { label: 'Con estas reglas', color: 'var(--serie-1)' }]} />
                <LogHistogram edges={h.edges} marks={marks} xLabel={mcccTab} height={260} ariaLabel={`Histograma de ${mcccTab} antes y después de limpiar`}
                  series={[{ id: 'antes', label: 'Crudo', color: 'var(--serie-3)', counts: h.counts.antes, style: 'outline' }, { id: 'despues', label: 'Con estas reglas', color: 'var(--serie-1)', counts: h.counts.despues }]} />
              </Fig>
              <p>{narrative.decisiones}</p>
              <Tab n={++tab} caption="Efecto de cada combinación de decisiones sobre el número de filas y las proporciones de archivos con bug (la elegida está marcada).">
                <table className="rep-table">
                  <thead><tr><th>Rutas · atípicos</th><th>Filas</th><th>P(bug | C)</th><th>P(bug | no C)</th><th>Diferencia</th></tr></thead>
                  <tbody>{preview.impact.map((r) => (
                    <tr key={`${r.path_policy}-${r.outlier_policy}`} style={r.selected ? { fontWeight: 700 } : undefined}>
                      <td>{PATH_SHORT[r.path_policy]} · {OUT_SHORT[r.outlier_policy]}{r.selected ? ' ◀ elegida' : ''}</td>
                      <td>{fmtInt(r.n)}</td><td>{fmtPct(r.p_d_given_c)}</td><td>{fmtPct(r.p_d_given_nc)}</td><td>{fmt(r.risk_diff * 100, 1)} pp</td></tr>
                  ))}</tbody>
                </table>
              </Tab>
            </Sec>

            <Sec n={3} title="Tabla de contingencia">
              <p>{narrative.tabla}</p>
              <Tab n={++tab} caption="Archivos según complejidad (C: McCC > umbral) y defecto (D: bug > 0), con las reglas elegidas.">
                <Table2x2 t={preview.table2x2} caption="" />
              </Tab>
            </Sec>

            <Sec n={4} title="Inferencia estadística">
              {!adaReady && <p className="rep-note">El motor Ada no está disponible en este momento, así que esta sección no se pudo calcular.</p>}
              {adaReady && !live && <p className="label" role="status">Calculando con {motor}…</p>}
              {live && g && narrative.welch && (
                <>
                  <h3>4.1 Comparación de medias de McCC (Welch)</h3>
                  <p>{narrative.welch}</p>
                  <pre className="math rep-math">{`H₀: ${ALT_H0[live.meta.alternative].h0}      H₁: ${ALT_H0[live.meta.alternative].h1}

t = (x̄₁ − x̄₂) / √(s₁²/n₁ + s₂²/n₂)
  = (${fmt(g.defectuosos.mean, 2)} − ${fmt(g.sin_defecto.mean, 2)}) / √(${fmt(g.defectuosos.sd, 2)}²/${fmtInt(g.defectuosos.n)} + ${fmt(g.sin_defecto.sd, 2)}²/${fmtInt(g.sin_defecto.n)})
  = ${fmt(live.welch.statistic, 3)}`}</pre>
                  <p className="rep-seal">{seal(live.welch)}</p>
                  {live.welch.ci && <Fig n={++fig} caption="Diferencia de medias de McCC (con bug − sin bug) con su intervalo de confianza; la línea es la hipótesis nula (0).">
                    <Interval label="Diferencia de medias" estimate={live.welch.estimate ?? 0} low={live.welch.ci.low} high={live.welch.ci.high} reference={0} referenceLabel="0 (sin diferencia)" level={live.welch.ci.level} decimals={1} />
                  </Fig>}
                  <Fig n={++fig} caption="Distribución de McCC en cada grupo, como proporción de los archivos del grupo (escala logarítmica).">
                    <Legend items={[{ label: `Con bug (n = ${fmtInt(g.defectuosos.n)})`, color: 'var(--serie-2)' }, { label: `Sin bug (n = ${fmtInt(g.sin_defecto.n)})`, color: 'var(--serie-1)' }]} />
                    <LogHistogram edges={live.hist.edges} normalize xLabel="McCC" height={250} ariaLabel="Histograma de McCC por grupo"
                      series={[{ id: 'sin', label: 'Sin bug', color: 'var(--serie-1)', counts: live.hist.counts.sin_defecto }, { id: 'con', label: 'Con bug', color: 'var(--serie-2)', counts: live.hist.counts.defectuosos }]} />
                  </Fig>

                  <h3>4.2 ¿Cambia la conclusión si cambian los supuestos?</h3>
                  <p>{narrative.sensibilidad}</p>
                  <Tab n={++tab} caption="Tres formas de comparar los dos grupos.">
                    <table className="rep-table">
                      <thead><tr><th>Prueba</th><th>Estadístico</th><th>Valor p</th><th>Efecto</th><th>Decisión (α = {String(alpha).replace('.', ',')})</th><th>Calculada por</th></tr></thead>
                      <tbody>{([['Welch sobre McCC', live.welch, motor], ['Welch sobre log(1 + McCC)', live.welch_log, motor], ['Mann-Whitney (rangos)', live.robust, 'Este panel (scipy + rangos)']] as [string, AdaTest, string][]).map(([name, t, by]) => (
                        <tr key={name}><td>{name}</td><td>{fmt(t.statistic, 2)}</td><td>{fmtP(t.p_value)}</td><td>{fmt(t.effect_size?.value, 3)}</td><td>{t.p_value < alpha ? 'Rechaza H₀' : 'No rechaza H₀'}</td><td>{by}</td></tr>
                      ))}</tbody>
                    </table>
                  </Tab>

                  <h3>4.3 Independencia entre complejidad y defecto (χ²)</h3>
                  <p>{narrative.chi}</p>
                  <Tab n={++tab} caption="Observados y esperados si «ser complejo» y «tener bug» fueran independientes.">
                    <Table2x2 t={live.table2x2} caption="" expected={expectedOf(live.table2x2)} />
                  </Tab>
                  <p className="rep-seal">{seal(live.chi_square)}</p>

                  <h3>4.4 Comparación de dos proporciones</h3>
                  <p>{narrative.proporciones}</p>
                  {live.two_proportions.ci && <Fig n={++fig} caption="Diferencia entre P(bug | complejo) y P(bug | no complejo) con su intervalo de confianza (Newcombe).">
                    <Interval label="Diferencia de proporciones" estimate={live.two_proportions.estimate ?? 0} low={live.two_proportions.ci.low} high={live.two_proportions.ci.high} reference={0} referenceLabel="0 (sin diferencia)" level={live.two_proportions.ci.level} decimals={3} />
                  </Fig>}
                  <p className="rep-seal">{seal(live.two_proportions)}</p>

                  <h3>4.5 Teorema de Bayes</h3>
                  <p>{narrative.bayes}</p>
                  <pre className="math rep-math">{`P(D | C) = P(C | D) · P(D) / P(C)
        = ${fmt(live.bayes.p_C_given_D, 4)} · ${fmt(live.bayes.prior, 4)} / ${fmt(live.bayes.p_C, 4)} = ${fmt(live.bayes.posterior, 4)}`}</pre>
                  <Fig n={++fig} caption="Probabilidad de bug en general y sabiendo que el archivo es complejo."><Bars prior={live.bayes.prior} posterior={live.bayes.posterior} /></Fig>
                  <p className="rep-seal">{live.bayes.verified ? '✓ verificado' : '✗ las vías no coinciden'}: {live.bayes.verification_methods.join(' · ')}</p>
                </>
              )}
            </Sec>

            <Sec n={5} title="Límites de estas conclusiones">
              <ul>{narrative.limites.map((l) => <li key={l}>{l}</li>)}</ul>
            </Sec>

            <Sec n={6} title="Declaración de uso de IA">
              <p>Este informe y el panel que lo genera se construyeron con asistencia de Claude Code (Anthropic) a petición de Diego López, {motor === 'Ada' ? 'usando el motor estadístico Ada' : 'usando el motor estadístico local de Python (SciPy y fórmulas a mano; en este caso no se usó Ada)'}. Las cifras salen de scripts verificados con doble método, no se calcularon «a mano» por la IA. El grupo debe poder explicar cada línea del código y cada decisión, y la interpretación y las conclusiones del trabajo se redactan y defienden por el grupo.</p>
            </Sec>

            <Sec n={7} title="Referencias">
              <ul className="rep-refs">
                <li>Ferenc, R., Tóth, Z., Ladányi, G., Siket, I., &amp; Gyimóthy, T. (2020). <em>Unified Bug Dataset</em> (v1.2) [Conjunto de datos]. Zenodo. https://doi.org/10.5281/zenodo.3693686</li>
                <li>Shepperd, M., Song, Q., Sun, Z., &amp; Mair, C. (2013). Data quality: Some comments on the NASA software defect datasets. <em>IEEE Transactions on Software Engineering, 39</em>(9), 1208–1215. https://doi.org/10.1109/TSE.2013.11</li>
                <li>McCabe, T. J. (1976). A complexity measure. <em>IEEE Transactions on Software Engineering, SE-2</em>(4), 308–320.</li>
              </ul>
            </Sec>
            <footer className="rep-foot">
              Reglas: {PATH_SHORT[rules.path_policy]} (rutas) · {OUT_SHORT[rules.outlier_policy]} (atípicos) · umbrales McCC &gt; {rules.mccc_threshold}, bug &gt; {rules.bug_threshold} · α = {String(alpha).replace('.', ',')} ·
              {' '}{live ? (live.meta.matches_saved ? 'coincide con el conjunto guardado' : 'cálculo en vivo (sin guardar)') : 'sin inferencia'} · generado {stamp.toLocaleString('es-CO')}
            </footer>
          </>
        )}
      </article>
    </div>
  )
}
