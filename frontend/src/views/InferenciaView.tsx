import { Loader } from 'lucide-react'
import { useEffect } from 'react'
import { AsistenteAda } from '../features/assistant/AsistenteAda'
import { Bars } from '../features/charts/Bars'
import { Interval } from '../features/charts/Interval'
import { Legend, LogHistogram } from '../features/charts/LogHistogram'
import { Table2x2 } from '../features/charts/Table2x2'
import { fmt, fmtInt, fmtP, fmtPct, fmtSig } from '../lib/format'
import { expectedOf } from '../lib/stats'
import { useStore } from '../state/store'
import type { AdaTest } from '../state/types'
import { Panel, Readout, Row } from '../ui/Panel'
import { SegmentedTabs } from '../ui/SegmentedTabs'
import { Verified } from '../ui/Verified'

const ALT_TEXT = { 'two-sided': 'μ₁ ≠ μ₂', greater: 'μ₁ > μ₂', less: 'μ₁ < μ₂' } as const

const effectShort = (name?: string) => (!name ? '' : name.startsWith('g de') ? 'g de Hedges' : name.startsWith('prob') ? 'P(X>Y)' : '')

/** Sello con los métodos con los que Ada comprobó el resultado (y cuánto difirieron). */
function Seal({ t }: { t: AdaTest }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
      <Verified ok={t.verified} label={t.verified ? 'Verificado por dos vías' : 'Las vías no coinciden'} />
      <span className="small">{t.verification_methods.join(' · ')}{t.discrepancy != null ? ` · diferencia entre métodos: ${fmtSig(t.discrepancy, 2)}` : ''}</span>
    </div>
  )
}

function Warnings({ items }: { items?: string[] }) {
  if (!items?.length) return null
  return (
    <ul className="small mt-3 flex flex-col gap-1" style={{ color: 'var(--warn)' }}>
      {items.map((w) => <li key={w}>⚠ {w}</li>)}
    </ul>
  )
}

export function InferenciaView() {
  const applied = useStore((s) => s.applied)
  const ada = useStore((s) => s.health?.ada)
  const alpha = useStore((s) => s.alpha)
  const alt = useStore((s) => s.alternative)
  const setAlpha = useStore((s) => s.setAlpha)
  const setAlt = useStore((s) => s.setAlternative)
  const res = useStore((s) => s.inference)
  const busy = useStore((s) => s.inferenceBusy)
  const err = useStore((s) => s.inferenceError)
  const run = useStore((s) => s.runInference)
  const setView = useStore((s) => s.setView)

  const sha = applied?.output.sha256
  const ready = !!ada?.ready
  // Calcula al entrar y cada vez que cambian α, la hipótesis o el conjunto guardado (el servidor guarda en caché).
  useEffect(() => { if (sha && ready) void run() }, [sha, ready, alpha, alt, run])

  if (!applied) {
    return (
      <div className="flex max-w-[760px] flex-col gap-6">
        <p className="lead">La inferencia se calcula sobre el conjunto limpio y guardado.</p>
        <Panel title="Primero hay que limpiar" note="Así cada resultado queda atado a una huella SHA-256 y a las reglas que lo produjeron.">
          <button type="button" className="chip" style={{ height: 40, paddingInline: 18 }} onClick={() => setView('limpieza')}>Ir a la limpieza</button>
        </Panel>
      </div>
    )
  }

  const g = res?.groups
  const w = res?.welch
  const fresh = res && res.meta.alpha === alpha && res.meta.alternative === alt

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap gap-5">
          <div>
            <p className="label mb-1">Nivel de significancia α</p>
            <SegmentedTabs label="Nivel de significancia" value={String(alpha)} onChange={(v) => setAlpha(Number(v))}
              options={[{ value: '0.1', label: '0,10' }, { value: '0.05', label: '0,05' }, { value: '0.01', label: '0,01' }]} />
          </div>
          <div>
            <p className="label mb-1">Hipótesis alternativa de Welch (μ₁: con bug · μ₂: sin bug)</p>
            <SegmentedTabs label="Hipótesis alternativa" value={alt} onChange={setAlt}
              options={[{ value: 'two-sided', label: 'Distintas (≠)' }, { value: 'greater', label: 'Con bug mayor (>)' }, { value: 'less', label: 'Con bug menor (<)' }]} />
          </div>
        </div>
        <p className="small flex items-center gap-2" role="status">
          {!ready ? (ada?.phase === 'error' ? `Ada no está disponible: ${ada.error}` : <><Loader size={14} className="animate-spin" aria-hidden /> Ada se está cargando…</>)
            : busy ? <><Loader size={14} className="animate-spin" aria-hidden /> Calculando con Ada…</> : fresh ? 'Calculado con Ada' : ''}
        </p>
      </div>

      {err && <Panel title="No se pudo calcular" note={err}><p className="small">Si Ada estaba cargando, vuelve a intentarlo en unos segundos.</p></Panel>}

      {res && g && w && (
        <div className="flex flex-col gap-6" style={{ opacity: busy ? 0.6 : 1, transition: 'opacity var(--t) var(--ease)' }}>
          <h2 className="lead max-w-[42ch]" aria-live="polite">
            Los archivos con bug tienen una complejidad media de {fmt(g.defectuosos.mean, 1)} frente a {fmt(g.sin_defecto.mean, 1)} en los demás
            (diferencia {fmt(w.estimate, 1)}; IC {Math.round((w.ci?.level ?? 0.95) * 100)} % de {fmt(w.ci?.low, 1)} a {fmt(w.ci?.high, 1)}).
            {' '}<span className="label">Es una asociación en estos datos, no una causa.</span>
          </h2>

          <Panel title="Prueba t de Welch" note="Compara la media de McCC entre archivos con bug (grupo 1) y sin bug (grupo 2), sin suponer varianzas iguales.">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_1fr]">
              <div className="min-w-0">
                <pre className="math">{`H₀: μ₁ = μ₂      H₁: ${ALT_TEXT[res.meta.alternative]}

t = (x̄₁ − x̄₂) / √(s₁²/n₁ + s₂²/n₂)
  = (${fmt(g.defectuosos.mean, 2)} − ${fmt(g.sin_defecto.mean, 2)}) / √(${fmt(g.defectuosos.sd, 2)}²/${fmtInt(g.defectuosos.n)} + ${fmt(g.sin_defecto.sd, 2)}²/${fmtInt(g.sin_defecto.n)})
  = ${fmt(w.statistic, 3)}`}</pre>
                <div className="mt-4">
                  <Readout>
                    <Row label="Estadístico t" color="var(--serie-1)">{fmt(w.statistic, 3)}</Row>
                    <Row label="Grados de libertad (Welch–Satterthwaite)">{fmt(w.df, 1)}</Row>
                    <Row label="Valor p" color="var(--serie-2)">{fmtP(w.p_value)}</Row>
                    <Row label={`Tamaño del efecto (${w.effect_size?.name})`}>{fmt(w.effect_size?.value, 3)} · {w.effect_size?.interpretation}</Row>
                    <Row label="Decisión"><span className="text-right">{w.decision}</span></Row>
                  </Readout>
                </div>
              </div>
              <div className="flex min-w-0 flex-col gap-5">
                {w.ci && <Interval label={`Diferencia de medias de McCC (${w.ci.of})`} estimate={w.estimate ?? 0} low={w.ci.low} high={w.ci.high} reference={0} referenceLabel="0 (sin diferencia)" level={w.ci.level} decimals={1} />}
                <Readout>
                  <Row label="Grupo 1 · con bug">n = {fmtInt(g.defectuosos.n)} · mediana {fmt(g.defectuosos.median, 0)}</Row>
                  <Row label="Grupo 2 · sin bug">n = {fmtInt(g.sin_defecto.n)} · mediana {fmt(g.sin_defecto.median, 0)}</Row>
                  {w.assumptions && <Row label="Levene (varianzas)">{w.assumptions.levene_p === 0 ? 'p < 0,000001' : `p ${fmtP(w.assumptions.levene_p)}`}</Row>}
                  {w.assumptions?.normality_x && <Row label="Asimetría de cada grupo">{fmt(w.assumptions.normality_x.skew, 1)} y {fmt(w.assumptions.normality_y?.skew, 1)}</Row>}
                </Readout>
              </div>
            </div>
            <Seal t={w} />
            <Warnings items={w.warnings} />
          </Panel>

          <Panel title="¿Cambia la conclusión si cambian los supuestos?" note="McCC es muy asimétrica: la media de cada grupo está arrastrada por unos pocos archivos enormes. Se repite la comparación de tres maneras.">
            <div className="overflow-x-auto">
              <table className="data-table min-w-[680px]">
                <thead><tr><th scope="col">Prueba</th><th scope="col">Estadístico</th><th scope="col">Valor p</th><th scope="col">Efecto</th><th scope="col">Decisión</th><th scope="col">Calculada por</th></tr></thead>
                <tbody>
                  {([
                    ['Welch sobre McCC', res.welch, 'Ada'],
                    ['Welch sobre log(1 + McCC)', res.welch_log, 'Ada'],
                    ['Mann-Whitney (rangos)', res.robust, 'Dashboard (scipy + rangos)'],
                  ] as [string, AdaTest, string][]).map(([name, t, by]) => (
                    <tr key={name}>
                      <td>{name}</td><td>{fmtSig(t.statistic)}</td><td>{fmtP(t.p_value)}</td>
                      <td title={t.effect_size?.name}>{fmt(t.effect_size?.value, 3)} <span className="label">{effectShort(t.effect_size?.name)}</span></td>
                      <td>{t.p_value < alpha ? 'Rechaza H₀' : 'No rechaza H₀'}</td>
                      <td><span className="label">{by}</span> {t.verified && <Verified ok label="verificada" methods={t.verification_methods} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="small mt-3">
              {[res.welch, res.welch_log, res.robust].every((t) => t.p_value < alpha) ? 'Las tres comparaciones rechazan H₀: la conclusión no depende del supuesto de normalidad.'
                : [res.welch, res.welch_log, res.robust].every((t) => t.p_value >= alpha) ? 'Ninguna de las tres rechaza H₀.'
                  : 'Las comparaciones no coinciden entre sí: la conclusión depende del supuesto; hay que discutirlo.'}
              {' '}Con {fmtInt(res.meta.rows)} filas casi cualquier diferencia sale «significativa»: lo que informa es el tamaño del efecto (P(X&gt;Y) ={' '}
              {fmt(res.robust.effect_size?.value, 3)}: elegido al azar, un archivo con bug es más complejo que uno sin bug el {fmtPct(res.robust.effect_size?.value)} de las veces).
            </p>
            {res.robust.ci && <div className="mt-5 max-w-[560px]"><Interval label={`P(X>Y) · ${res.robust.ci.of}`} estimate={res.robust.effect_size?.value ?? 0.5} low={res.robust.ci.low} high={res.robust.ci.high} reference={0.5} referenceLabel="0,5 (sin efecto)" color="var(--serie-2)" level={res.robust.ci.level} decimals={3} /></div>}
          </Panel>

          <Panel title="Cómo se reparte la complejidad en cada grupo" note="Cada grupo se muestra como proporción de sus propios archivos, porque uno tiene el triple de datos que el otro.">
            <div className="flex flex-col gap-3">
              <Legend items={[{ label: `Con bug (n = ${fmtInt(g.defectuosos.n)})`, color: 'var(--serie-2)' }, { label: `Sin bug (n = ${fmtInt(g.sin_defecto.n)})`, color: 'var(--serie-1)' }]} />
              <LogHistogram edges={res.hist.edges} normalize xLabel="McCC" height={300}
                series={[
                  { id: 'sin', label: 'Sin bug', color: 'var(--serie-1)', counts: res.hist.counts.sin_defecto },
                  { id: 'con', label: 'Con bug', color: 'var(--serie-2)', counts: res.hist.counts.defectuosos },
                ]}
                marks={[{ value: g.defectuosos.median, label: `mediana con bug = ${fmt(g.defectuosos.median, 0)}`, color: 'var(--serie-2)' }, { value: g.sin_defecto.median, label: `mediana sin bug = ${fmt(g.sin_defecto.median, 0)}`, color: 'var(--serie-1)' }]}
                ariaLabel="Histograma de McCC en escala logarítmica para archivos con y sin bug, como proporción de cada grupo" />
            </div>
          </Panel>

          <div className="grid grid-cols-1 gap-6">
            <Panel title="Chi-cuadrado de independencia" note="¿Son independientes «ser complejo» (McCC > 10) y «tener bug»?">
              <Table2x2 t={res.table2x2} caption="Observados y esperados si fueran independientes" expected={expectedOf(res.table2x2)} />
              <div className="mt-4">
                <pre className="math">{`H₀: C y D son independientes
χ² = Σ (O − E)² / E = ${fmt(res.chi_square.statistic, 2)}   (gl = ${res.chi_square.df})`}</pre>
                <div className="mt-3">
                  <Readout>
                    <Row label="Valor p" color="var(--serie-2)">{fmtP(res.chi_square.p_value)}</Row>
                    <Row label={res.chi_square.effect_size?.name ?? 'Efecto'}>{fmt(res.chi_square.effect_size?.value, 3)} · {res.chi_square.effect_size?.interpretation}</Row>
                    <Row label="Esperado mínimo en una celda">{fmt(res.chi_square.expected_min, 1)}</Row>
                  </Readout>
                </div>
                <p className="small mt-3">{res.chi_square.decision}</p>
                <Seal t={res.chi_square} />
                <Warnings items={res.chi_square.warnings} />
              </div>
            </Panel>

            <Panel title="Comparación de dos proporciones" note="P(bug | complejo) frente a P(bug | no complejo): z con proporción conjunta bajo H₀.">
              <Readout>
                <Row label="P(D | C): complejos" color="var(--serie-2)">{fmtPct(res.probabilities.p_d_given_c, 2)}</Row>
                <Row label="P(D | C̄): no complejos" color="var(--serie-1)">{fmtPct(res.probabilities.p_d_given_nc, 2)}</Row>
                <Row label="Estadístico z">{fmt(res.two_proportions.statistic, 2)}</Row>
                <Row label="Valor p">{fmtP(res.two_proportions.p_value)}</Row>
                <Row label="Razón de riesgos">{fmt(res.probabilities.risk_ratio, 2)}</Row>
                <Row label="Razón de momios">{fmt(res.two_proportions.effect_size?.value, 2)}</Row>
              </Readout>
              {res.two_proportions.ci && (
                <div className="mt-5">
                  <Interval label={`Diferencia de proporciones (${res.two_proportions.ci.of})`} estimate={res.two_proportions.estimate ?? 0} low={res.two_proportions.ci.low} high={res.two_proportions.ci.high} reference={0} referenceLabel="0 (sin diferencia)" level={res.two_proportions.ci.level} decimals={3} />
                </div>
              )}
              <p className="small mt-3">{res.two_proportions.decision} (La prueba z y χ² son de dos colas.)</p>
              <Seal t={res.two_proportions} />
              <Warnings items={res.two_proportions.warnings} />
            </Panel>
          </div>

          <Panel title="Teorema de Bayes con los conteos reales" note="Probabilidad de que un archivo tenga bug sabiendo que es complejo, estimada con esta muestra.">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_1fr]">
              <div className="min-w-0">
                <pre className="math">{`P(D | C) = P(C | D) · P(D) / P(C)
        = ${fmt(res.bayes.p_C_given_D, 4)} · ${fmt(res.bayes.prior, 4)} / ${fmt(res.bayes.p_C, 4)}
        = ${fmt(res.bayes.posterior, 4)}

conteo directo: ${fmtInt(res.bayes.counts.DC)} / ${fmtInt(res.bayes.counts.C)} = ${fmt(res.bayes.posterior, 4)}`}</pre>
                <div className="mt-4">
                  <Readout>
                    <Row label="P(C | D): complejos entre los defectuosos">{fmtPct(res.bayes.p_C_given_D, 2)}</Row>
                    <Row label="P(C | D̄): complejos entre los sanos">{fmtPct(res.bayes.p_C_given_notD, 2)}</Row>
                  </Readout>
                </div>
              </div>
              <Bars prior={res.bayes.prior} posterior={res.bayes.posterior} />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
              <Verified ok={res.bayes.verified} label={res.bayes.verified ? 'Verificado por tres vías' : 'Las vías no coinciden'} />
              <span className="small">{res.bayes.verification_methods.join(' · ')}</span>
            </div>
            <Warnings items={res.bayes.warnings} />
          </Panel>

          <AsistenteAda res={res} />

          <Panel title="Límites de estas conclusiones" note="Lo que estos números no dicen.">
            <ul className="small flex flex-col gap-2">
              <li><strong>Independencia.</strong> {res.independence.note}</li>
              <li><strong>Causalidad.</strong> Un archivo complejo suele ser también más grande y más antiguo; las pruebas miden asociación, no que la complejidad cause los defectos.</li>
              <li><strong>Alcance.</strong> Solo código Java del Unified Bug Dataset: no se generaliza a otros lenguajes ni proyectos.</li>
              <li><strong>Umbrales.</strong> McCC &gt; {res.meta.rules.mccc_threshold} y bug &gt; {res.meta.rules.bug_threshold} se fijaron antes de abrir los datos; cambiarlos cambia las tablas.</li>
              <li><strong>Decisiones de limpieza.</strong> Rutas repetidas: «{res.meta.rules.path_policy}» · atípicos: «{res.meta.rules.outlier_policy}». La vista de limpieza muestra cómo cambia la respuesta con las otras opciones.</li>
            </ul>
          </Panel>

          <Panel title="De dónde salen estos números">
            <Readout>
              <Row label="Datos">{fmtInt(res.meta.rows)} filas · SHA-256 {res.meta.sha256?.slice(0, 16)}…</Row>
              <Row label="Guardado">{new Date(res.meta.created_utc).toLocaleString('es-CO')}</Row>
              <Row label="Motor">{res.meta.ada.mode === 'remote' ? 'Ada (API remota; el cálculo lo hace otro equipo)' : `Ada (${res.meta.ada.root})`}</Row>
              <Row label="α y hipótesis">{res.meta.alpha} · {ALT_TEXT[res.meta.alternative]}</Row>
            </Readout>
          </Panel>
        </div>
      )}
    </div>
  )
}
