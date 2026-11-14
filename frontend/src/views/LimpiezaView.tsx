import { ArrowRight, Lock, Save } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Funnel } from '../features/charts/Funnel'
import { Legend, LogHistogram, type VMark } from '../features/charts/LogHistogram'
import { Table2x2 } from '../features/charts/Table2x2'
import { fmt, fmtInt, fmtP, fmtPct } from '../lib/format'
import { sameRules, useStore } from '../state/store'
import type { OutlierPolicy, PathPolicy } from '../state/types'
import { Choice } from '../ui/Choice'
import { Panel, Readout, Row } from '../ui/Panel'
import { SegmentedTabs } from '../ui/SegmentedTabs'
import { Switch } from '../ui/Switch'
import { Verified } from '../ui/Verified'

type Var = 'McCC' | 'LOC'

const PATH_NAME: Record<PathPolicy, string> = { keep_all: 'Conservar todas', keep_first: 'Dejar la primera', drop_all: 'Quitar todas' }
const OUT_NAME: Record<OutlierPolicy, string> = { keep: 'Conservar', tukey3: 'Q3 + 3·RIC', p999: 'Percentil 99,9' }

export function LimpiezaView() {
  const rules = useStore((s) => s.rules)
  const patch = useStore((s) => s.patchRules)
  const preview = useStore((s) => s.preview)
  const busy = useStore((s) => s.previewBusy)
  const error = useStore((s) => s.previewError)
  const applied = useStore((s) => s.applied)
  const applying = useStore((s) => s.applying)
  const applyError = useStore((s) => s.applyError)
  const apply = useStore((s) => s.applyRules)
  const setView = useStore((s) => s.setView)
  const [v, setV] = useState<Var>('McCC')

  const removedBy = useMemo(() => Object.fromEntries((preview?.steps ?? []).map((s) => [s.id, s.removed])), [preview])
  const impact = preview?.impact ?? []

  const stability = useMemo(() => {
    if (!impact.length) return null
    const diffs = impact.map((r) => r.risk_diff)
    const lo = Math.min(...diffs), hi = Math.max(...diffs)
    const allPositive = lo > 0
    const allSignificant = impact.every((r) => (r.welch_p ?? 1) < 0.05)
    return { lo, hi, allPositive, allSignificant }
  }, [impact])

  if (error && !preview) return <Panel title="No se pudo calcular la vista previa" note={error}><p className="small">Revisa el servidor y recarga.</p></Panel>
  if (!preview) return <p className="label py-24 text-center" role="status">Calculando la limpieza…</p>

  const stale = applied ? !sameRules(applied.rules, rules) : false
  const verifiedCount = preview.steps.filter((s) => s.verified).length
  const checkable = preview.steps.filter((s) => s.verified !== null).length
  const fence = preview.fences[v]
  const marks: VMark[] = [
    { value: fence.tukey3_upper, label: `Q3 + 3·RIC = ${fmt(fence.tukey3_upper, 0)}`, color: 'var(--serie-2)' },
    { value: fence.p999_upper, label: `percentil 99,9 = ${fmt(fence.p999_upper, 0)}`, color: 'var(--warn)' },
  ]
  if (v === 'McCC') marks.push({ value: rules.mccc_threshold, label: `umbral McCC > ${rules.mccc_threshold}`, color: 'var(--ink-2)' })
  const h = preview.hist[v]

  return (
    <div className="flex flex-col gap-6">
      <h2 className="lead max-w-[40ch]" aria-live="polite">
        Con estas reglas quedan {fmtInt(preview.rows_out)} de {fmtInt(preview.rows_in)} filas.
        {' '}<span style={{ color: preview.verified ? 'var(--ok)' : 'var(--bad)' }}>
          {preview.verified ? `Cada paso coincide entre pandas y DuckDB (${verifiedCount} de ${checkable}).` : 'Hay pasos que NO coinciden: no se puede guardar.'}
        </span>
        {busy && <span className="label ml-3" role="status">recalculando…</span>}
      </h2>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(320px,400px)_1fr]">
        {/* ───────── Reglas ───────── */}
        <div className="flex flex-col gap-6">
          <Panel title="Reglas siempre recomendables" note="Quitan filas que no son datos válidos. Se pueden apagar para ver su efecto.">
            <Switch label="Integridad" hint={`Datos faltantes, negativos, LOC < LLOC o LOC ≤ 0 · quita ${fmtInt(removedBy.integridad ?? 0)}`}
              checked={rules.integrity} onChange={(integrity) => patch({ integrity })} />
            <Switch label="Duplicados exactos" hint={`Las 11 columnas iguales · quita ${fmtInt(removedBy.duplicados ?? 0)}`}
              checked={rules.drop_exact_duplicates} onChange={(drop_exact_duplicates) => patch({ drop_exact_duplicates })} />
            <Switch label="Columnas constantes" hint={`Quita ${preview.dropped_columns.length ? preview.dropped_columns.join(', ') : 'ninguna'} (siempre valen lo mismo)`}
              checked={rules.drop_constant_columns} onChange={(drop_constant_columns) => patch({ drop_constant_columns })} />
          </Panel>

          <Panel title="Decisión 1 · Rutas repetidas" note="Un mismo archivo en varias filas rompe la independencia. Decide el grupo; aquí se ve qué cuesta cada opción.">
            <Choice label="Qué hacer con las rutas repetidas" value={rules.path_policy} onChange={(path_policy) => patch({ path_policy })}
              options={[
                { value: 'keep_first', title: PATH_NAME.keep_first, hint: 'Una fila por archivo (la primera que aparece en el CSV). Respeta la independencia; el orden del CSV decide cuál queda.' },
                { value: 'drop_all', title: PATH_NAME.drop_all, hint: 'Se descarta toda ruta con más de una fila. Evita elegir, pero pierde también el archivo bueno.' },
                { value: 'keep_all', title: PATH_NAME.keep_all, hint: 'No se toca. Es la opción que más infla la confianza: las filas no son independientes.' },
              ]} />
          </Panel>

          <Panel title="Decisión 2 · Atípicos extremos" note="Quitar los archivos más complejos puede quitar justo la señal que se estudia. Por defecto solo se señalan.">
            <Choice label="Qué hacer con los atípicos extremos" value={rules.outlier_policy} onChange={(outlier_policy) => patch({ outlier_policy })}
              options={[
                { value: 'keep', title: OUT_NAME.keep, hint: 'No se quita ninguno; se marcan en la gráfica. El análisis de sensibilidad muestra si cambian las conclusiones.',
                  badge: `se verían afectados ${fmtInt(Number(preview.steps.find((s) => s.id === 'atipicos')?.detail.se_quitarian_tukey3 ?? 0))}` },
                { value: 'tukey3', title: 'Más allá de Q3 + 3·RIC', hint: 'Regla de valor extremo de Tukey, en McCC o LOC. Es la más agresiva.',
                  badge: rules.outlier_policy === 'tukey3' ? `−${fmtInt(removedBy.atipicos ?? 0)}` : undefined },
                { value: 'p999', title: 'Por encima del percentil 99,9', hint: 'Solo el 0,1 % más extremo de cada variable.',
                  badge: rules.outlier_policy === 'p999' ? `−${fmtInt(removedBy.atipicos ?? 0)}` : undefined },
              ]} />
          </Panel>

          <Panel title="Fijado antes de abrir los datos">
            <p className="small mb-3 flex items-start gap-2"><Lock size={15} className="mt-[2px] shrink-0" aria-hidden />
              Los umbrales no se editan aquí: elegirlos mirando el resultado sería hacer trampa (p-hacking).</p>
            <Readout>
              <Row label="Complejo (C)">McCC &gt; {rules.mccc_threshold}</Row>
              <Row label="Defectuoso (D)">bug &gt; {rules.bug_threshold}</Row>
            </Readout>
          </Panel>
        </div>

        {/* ───────── Resultado ───────── */}
        <div className="flex min-w-0 flex-col gap-6" style={{ opacity: busy ? 0.65 : 1, transition: 'opacity var(--t) var(--ease)' }}>
          <Panel title="El embudo de limpieza" note="Azul: filas que siguen. Rojo: filas que se quitan en ese paso. Abre un paso para ver sus conteos y cómo se comprobó.">
            <Funnel steps={preview.steps} total={preview.rows_in} />
          </Panel>

          <Panel title="Antes y después" note="El contorno gris es el CSV crudo; las barras azules, lo que queda. Las líneas son umbrales posibles para los atípicos (calculados sobre los datos tras las reglas anteriores).">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <SegmentedTabs label="Variable" value={v} onChange={setV}
                options={[{ value: 'McCC', label: 'McCC' }, { value: 'LOC', label: 'LOC' }]} />
              <Legend items={[{ label: 'Crudo', color: 'var(--serie-3)', outline: true }, { label: 'Con estas reglas', color: 'var(--serie-1)' }]} />
            </div>
            <LogHistogram edges={h.edges} marks={marks} xLabel={v} height={320}
              series={[
                { id: 'antes', label: 'Crudo', color: 'var(--serie-3)', counts: h.counts.antes, style: 'outline' },
                { id: 'despues', label: 'Con estas reglas', color: 'var(--serie-1)', counts: h.counts.despues },
              ]}
              ariaLabel={`Histograma de ${v} antes y después de limpiar, en escala logarítmica`} />
          </Panel>

          <Panel title="Cómo cambia la respuesta según tus decisiones" note="Las nueve combinaciones posibles. Haz clic en una fila para elegirla. Welch aquí es una vista rápida (scipy); el resultado oficial lo calcula Ada con doble verificación.">
            <div className="overflow-x-auto">
              <table className="data-table min-w-[640px]">
                <thead>
                  <tr><th scope="col">Rutas · atípicos</th><th scope="col">Filas</th><th scope="col">P(bug | C)</th><th scope="col">P(bug | no C)</th><th scope="col">Diferencia</th><th scope="col">Welch t</th></tr>
                </thead>
                <tbody>
                  {impact.map((r) => (
                    <tr key={`${r.path_policy}-${r.outlier_policy}`} data-selected={r.selected}>
                      <td>
                        <button type="button" className="row-btn" aria-pressed={r.selected}
                          onClick={() => patch({ path_policy: r.path_policy, outlier_policy: r.outlier_policy })}>
                          <span className={r.selected ? 'font-semibold' : ''}>{PATH_NAME[r.path_policy]} · {OUT_NAME[r.outlier_policy]}</span>
                        </button>
                      </td>
                      <td>{fmtInt(r.n)}</td><td>{fmtPct(r.p_d_given_c)}</td><td>{fmtPct(r.p_d_given_nc)}</td>
                      <td className="font-semibold">{fmt(r.risk_diff * 100, 1)} pp</td>
                      <td>{fmt(r.welch_t, 1)} <span className="label">(p {fmtP(r.welch_p)})</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {stability && (
              <p className="small mt-3">
                La diferencia entre los dos grupos va de {fmt(stability.lo * 100, 1)} a {fmt(stability.hi * 100, 1)} puntos porcentuales según la política.
                {stability.allPositive ? ' En las nueve combinaciones los archivos complejos tienen más defectos' : ' El signo de la diferencia cambia según la política'}
                {stability.allPositive && stability.allSignificant ? ' y la prueba rápida de Welch rechaza igualdad en todas: lo que cambia es la magnitud, no la conclusión.' : '.'}
              </p>
            )}
          </Panel>

          <Panel title="La tabla 2×2 con estas reglas" note="Es la que usarán χ², la diferencia de proporciones y Bayes.">
            <Table2x2 t={preview.table2x2} caption="Archivos según complejidad (C) y defecto (D), con las reglas elegidas" />
          </Panel>

          <Panel title="Guardar el conjunto limpio" note="Escribe una copia en la carpeta de trabajo de Ada (nunca en data/raw), con huella SHA-256 y un registro en la bitácora de auditoría. Solo se guarda si todos los pasos están verificados.">
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className="chip" style={{ height: 40, paddingInline: 18, background: 'var(--ink)', color: 'var(--bg)', borderColor: 'var(--ink)' }}
                disabled={applying || !preview.verified || busy} onClick={() => void apply()}>
                <Save size={16} aria-hidden className="mr-2" /> {applying ? 'Guardando…' : applied && !stale ? 'Guardar de nuevo' : 'Aplicar y guardar'}
              </button>
              {applied && !stale && <Verified ok label="Guardado con estas reglas" />}
              {stale && <span className="small" style={{ color: 'var(--warn)' }}>Las reglas cambiaron desde el último guardado: vuelve a aplicar antes de hacer inferencia.</span>}
            </div>
            {applyError && <p className="small mt-3" style={{ color: 'var(--bad)' }} role="alert">{applyError}</p>}
            {applied && (
              <div className="mt-5">
                <Readout>
                  <Row label="Filas guardadas">{fmtInt(applied.output.rows)} de {fmtInt(applied.input.rows)}</Row>
                  <Row label="Columnas">{applied.output.columns.length}</Row>
                  <Row label="Guardado">{new Date(applied.created_utc).toLocaleString('es-CO')}</Row>
                  <Row label="SHA-256 de salida"><span className="font-mono text-[0.8125rem]" title={applied.output.sha256}>{applied.output.sha256.slice(0, 16)}…</span></Row>
                  <Row label="Auditoría de Ada">{applied.audit?.timestamp_utc ? 'registrada' : 'no registrada'}</Row>
                </Readout>
                <p className="small mt-3 break-all">Archivo: {applied.output.path}</p>
                {applied.audit?.skipped && <p className="small mt-1" style={{ color: 'var(--warn)' }}>Auditoría omitida: {applied.audit.skipped}</p>}
                <div className="mt-4">
                  <button type="button" className="chip" style={{ height: 40, paddingInline: 18 }} disabled={stale} onClick={() => setView('inferencia')}>
                    Ir a la inferencia <ArrowRight size={16} aria-hidden className="ml-2" />
                  </button>
                </div>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}
