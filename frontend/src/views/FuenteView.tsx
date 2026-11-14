import { ArrowRight, Check, Copy, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Legend, LogHistogram } from '../features/charts/LogHistogram'
import { Table2x2 } from '../features/charts/Table2x2'
import { copyText } from '../lib/export'
import { fmt, fmtInt, fmtPct } from '../lib/format'
import { useStore } from '../state/store'
import { Panel, Readout, Row } from '../ui/Panel'
import { SegmentedTabs } from '../ui/SegmentedTabs'

type Var = 'McCC' | 'LOC'

/** Un hallazgo de calidad: con símbolo y texto (no solo color) para decir si hay que actuar. */
function Finding({ label, value, act, note }: { label: string; value: string; act: boolean; note: string }) {
  return (
    <li className="flex items-start gap-3 border-t py-3 first:border-t-0 first:pt-0" style={{ borderColor: 'var(--rule)' }}>
      <span className="mt-[3px] shrink-0" style={{ color: act ? 'var(--warn)' : 'var(--ok)' }} aria-label={act ? 'Requiere decisión' : 'Sin problema'}>
        {act ? <TriangleAlert size={16} aria-hidden /> : <Check size={16} aria-hidden />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline justify-between gap-x-4">
          <span className="text-[0.9375rem]">{label}</span>
          <span className="font-semibold">{value}</span>
        </span>
        <span className="small block">{note}</span>
      </span>
    </li>
  )
}

export function FuenteView() {
  const profile = useStore((s) => s.profile)
  const err = useStore((s) => s.profileError)
  const setView = useStore((s) => s.setView)
  const [v, setV] = useState<Var>('McCC')
  const [copied, setCopied] = useState(false)

  if (err || !profile) {
    return <Panel title="No se pudo leer el conjunto de datos" note={err ?? 'Sin perfil todavía.'}>
      <p className="small">Revisa que exista el CSV (variable CODEPREDICT_DATASET) y recarga la página.</p>
    </Panel>
  }
  const p = profile
  const h = p.hist[v]
  const t = p.table2x2_raw
  const mcc = p.column_profile.find((c) => c.name === 'McCC')
  const sha = p.source.sha256

  return (
    <div className="flex flex-col gap-6">
      <h2 className="lead max-w-[40ch]" aria-live="polite">
        {fmtInt(p.rows)} archivos Java, pero solo {fmtInt(p.unique_paths)} rutas distintas: {fmtInt(p.rows_with_repeated_path)} filas repiten una ruta y {fmtInt(p.exact_duplicates)} son copias exactas.
      </h2>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.25fr]">
        <Panel title="Origen" note="El archivo original no se modifica nunca: la limpieza escribe una copia aparte, con su huella digital.">
          <Readout>
            <Row label="Conjunto">Unified Bug Dataset v1.2</Row>
            <Row label="Nivel">archivo (Java)</Row>
            <Row label="Filas × columnas">{fmtInt(p.rows)} × {p.columns}</Row>
            <Row label="Tamaño">{fmt(p.source.bytes / 1024 / 1024, 2)} MB</Row>
          </Readout>
          <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border p-3" style={{ borderColor: 'var(--rule)', background: 'var(--bg)' }}>
            <div className="min-w-0">
              <p className="label">SHA-256 del CSV de entrada</p>
              <p className="truncate font-mono text-[0.8125rem]" title={sha}>{sha}</p>
            </div>
            <button type="button" className="btn-icon shrink-0" aria-label="Copiar la huella SHA-256"
              onClick={() => void copyText(sha).then((ok) => { setCopied(ok); setTimeout(() => setCopied(false), 1500) })}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>
          <p className="small mt-3 break-all">Ruta: {p.source.path}</p>
        </Panel>

        <Panel title="Qué hay que revisar antes de analizar" note="Cada hallazgo es un conteo real de este archivo, comprobado con pandas y DuckDB.">
          <ul>
            <Finding label="Filas idénticas en las 11 columnas" value={fmtInt(p.exact_duplicates)} act={p.exact_duplicates > 0}
              note="Se pueden eliminar sin perder información." />
            <Finding label="Filas que repiten una ruta" value={fmtInt(p.rows_with_repeated_path)} act={p.rows_with_repeated_path > 0}
              note={`${fmtInt(p.paths_repeated)} rutas aparecen 2 o 3 veces (un mismo archivo en distintas versiones o proyectos). Rompe la independencia que suponen Welch y χ²: hay que decidir qué hacer.`} />
            <Finding label="Identificadores (ID) repetidos" value={fmtInt(p.duplicated_ids)} act={false}
              note="Los ID se reutilizan entre conjuntos: no sirven como clave. La ruta completa es la identidad de un archivo." />
            <Finding label="Datos faltantes o no numéricos" value={fmtInt(p.integrity.faltantes + p.integrity.no_numericos)} act={p.integrity.faltantes + p.integrity.no_numericos > 0}
              note="En las 7 métricas numéricas." />
            <Finding label="Valores imposibles (negativos, LOC < LLOC, LOC ≤ 0)" value={fmtInt(p.integrity.negativos + p.integrity.loc_menor_que_lloc + p.integrity.loc_no_positivo)}
              act={p.integrity.negativos + p.integrity.loc_menor_que_lloc + p.integrity.loc_no_positivo > 0} note="Coherencia entre métricas de tamaño." />
            <Finding label="Columnas constantes" value={p.constant_columns.length ? p.constant_columns.join(', ') : 'ninguna'} act={p.constant_columns.length > 0}
              note="No varían, así que no aportan información a ningún análisis." />
          </ul>
        </Panel>
      </div>

      <Panel title="Cómo se distribuyen las métricas" note="Casi todos los archivos son pequeños y unos pocos son enormes. Por eso el eje horizontal es logarítmico y por eso los promedios engañan: la mediana y la cola importan.">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <SegmentedTabs label="Variable" value={v} onChange={setV}
            options={[{ value: 'McCC', label: 'Complejidad ciclomática (McCC)' }, { value: 'LOC', label: 'Líneas de código (LOC)' }]} />
          {v === 'McCC' && mcc && <p className="small">Mediana {fmt(mcc.median, 0)} · media {fmt(mcc.mean, 1)} · máximo {fmtInt(mcc.max)} · asimetría {fmt(mcc.skew, 1)}</p>}
        </div>
        <div className="flex flex-col gap-3">
          <Legend items={[{ label: 'Archivos en el CSV crudo', color: 'var(--serie-1)' }]} />
          <LogHistogram edges={h.edges} series={[{ id: 'antes', label: 'Crudo', color: 'var(--serie-1)', counts: h.counts.antes }]}
            xLabel={v === 'McCC' ? 'McCC' : 'LOC'} height={300}
            marks={v === 'McCC' ? [{ value: 10, label: 'umbral McCC > 10', color: 'var(--serie-2)' }] : []}
            ariaLabel={`Histograma de ${v} en escala logarítmica`} />
        </div>
      </Panel>

      <Panel title="La tabla 2×2 antes de limpiar" note="Es solo una primera mirada: incluye copias y observaciones dependientes, así que todavía no se calcula ninguna prueba con ella.">
        <Table2x2 t={t} caption="Archivos según complejidad (C: McCC > 10) y defecto (D: bug > 0), sin limpiar" />
        <p className="small mt-3">
          {fmtPct(t.C_D / (t.C_D + t.C_ND))} de los archivos complejos tienen bug, frente a {fmtPct(t.NC_D / (t.NC_D + t.NC_ND))} de los demás.
        </p>
      </Panel>

      <div className="flex justify-end">
        <button type="button" className="chip" style={{ height: 40, paddingInline: 18 }} onClick={() => setView('limpieza')}>
          Pasar a la limpieza <ArrowRight size={16} aria-hidden className="ml-2" />
        </button>
      </div>
    </div>
  )
}
